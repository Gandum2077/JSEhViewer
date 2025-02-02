/**
 * WebDAV客户端的JSBox实现
 * 仅支持基本功能：列出文件、上传文件、下载文件、删除文件、移动文件、创建文件夹
 * 支持的认证方式：无、基本认证
 * 
 * 思考：
 * 致命错误：
 *   400 Bad Request
 *   401 Unauthorized
 *   403 Forbidden
 *   >=500 Internal Server Error
 *   以上状态码会抛出Fatal Error，终止当前Client运行
 * 
 * 列出文件：
 *   207 Multi-Status
 *   404 Not Found
 * 
 * 创建文件夹：
 *  201 Created
 *  其他错误状态码会抛出Error，终止当前操作
 * 
 * 上传文件：
 *  200 OK 覆盖了原有文件
 *  201 Created 新建了文件
 * 
 * 下载文件：
 *  200 OK
 *  404 Not Found 但是在此之前要先通过列出文件来确定是否存在，因此该错误不应该存在
 * 
 * 综上所述，只有列出文件的404状态码是可接受的，其他错误状态码都会抛出Error终止当前操作
 * 
 */

import * as cheerio from 'cheerio'
import { WebDAVService } from '../types'

/**
 * 自定义错误类，用于处理WebDAV操作中的各种错误
 * @param options - 错误信息、状态码和错误类型
 * @param options.message - 错误信息
 * @param options.statusCode - HTTP状态码（可选）
 * @param options.type - 错误类型，可以是 "timeout"、"http" 或 "other"
 *  - "timeout" 表示超时错误
 *  - "http" 表示HTTP错误，通常与状态码相关联，例如401、403、500等
 *  - "other" 表示$http.request的执行出现错误，例如网络问题
 */
export class WebDAVError extends Error {
  name: string;
  type: "timeout" | "http" | "other"; // 添加错误类型属性
  statusCode?: number; // 可选的状态码属性
  constructor({ message, statusCode, type }: {
    message: string;
    type: "timeout" | "http" | "other"
    statusCode?: number
  }) {
    super(message)
    this.name = 'WebDAVError';
    this.statusCode = statusCode;
    this.type = type;
  }
}

function __URLEncode(path: string, isdir: boolean) {
  if (!path) return ''
  // 合并多个斜杠
  path = path.replace(/\/+/g, '/')
  // remove leading and trailing slashes
  if (path.startsWith('/')) path = path.slice(1)
  if (path.endsWith('/')) path = path.slice(0, -1)
  const r = path.split('/').map(text => $text.URLEncode(text)).join('/')
  return isdir ? r + '/' : r
}

function __concatURL({ host, port, https, path }: { host: string, port?: number, https: boolean, path?: string }) {
  let url = `${https ? 'https' : 'http'}://${host}`
  if (port) url += ':' + port
  if (path) {
    url += '/' + __URLEncode(path, true)
  } else {
    url += '/'
  }
  return url
}

export class WebDAVClient {
  private _auth?: string
  private _baseURL: string
  constructor(service: Omit<WebDAVService, 'id' | 'name'>) {
    if (service.username && service.password) {
      this._auth = "Basic " + $text.base64Encode(service.username + ":" + service.password)
    }
    this._baseURL = __concatURL(service)
  }

  /**
   * 判断文件或文件夹是否存在
   * @param path 文件或文件夹路径
   * @param isdir 是否是文件夹，默认根据路径结尾是否为`/`判断
   * @returns 
   */
  async exists(path: string, isdir?: boolean) {
    if (isdir === undefined) {
      isdir = path.endsWith('/')
    }
    const resp = await this._request({
      method: 'PROPFIND',
      path: path,
      isdir,
      headers: {
        'Depth': "0"
      }
    })
    return resp.response.statusCode < 400
  }

  /**
   * 列出文件夹下的文件
   * @param options 
   * @param options.path 文件夹路径
   * @param options.timeout 超时时间，默认30s
   * @returns 
   */
  async list({ path, timeout }: { path: string, timeout?: number }): Promise<{
    name: string,
    href: string,
    isdir: boolean,
    isfile: boolean,
    size: number,
    lastModifiedDate: Date,
    createdDate: Date,
    contentType?: string
  }[] | undefined> {
    const resp = await this._request({
      method: 'PROPFIND',
      path: path,
      isdir: true,
      headers: {
        'Depth': "1"
      },
      timeout
    })
    // 在此方法中，404需要抛出错误，因为正确的实践是先从根目录获取列表，在从列表中挑选合适的子文件夹进行遍历
    // 那么子文件夹不应该存在404的情况
    // 如果根目录不存在，说明用户设置错误，需要抛出错误
    if (resp.response.statusCode === 404) throw new WebDAVError({
      statusCode: 404,
      message: '文件夹不存在',
      type: "http"
    })
    const $ = cheerio.load(resp.data)
    const files: {
      name: string,
      href: string,
      isdir: boolean,
      isfile: boolean,
      size: number,
      lastModifiedDate: Date,
      createdDate: Date,
      contentType?: string
    }[] = []
    $('D\\:response').slice(1).each((i, elem) => {
      const el = $(elem)
      const href = el.find('D\\:href').text();
      let tmp = href;
      if (tmp.endsWith('/')) tmp = tmp.slice(0, -1);
      const name = decodeURI(tmp.split('/').at(-1) || '');
      const isdir = el.find('D\\:collection').length > 0;
      const isfile = !isdir;
      const size = parseInt(el.find('D\\:getcontentlength').text() || '0');
      const lastModifiedDate = new Date(el.find('D\\:getlastmodified').text());
      const createdDate = new Date(el.find('D\\:creationdate').text());
      const contentType = el.find('D\\:getcontenttype').text() || undefined;
      files.push({
        name,
        href,
        isdir,
        isfile,
        size,
        lastModifiedDate,
        createdDate,
        contentType
      });
    });
    return files
  }

  /**
   * 上传文件
   * @param path 文件路径
   * @param data NSData
   * @param contentType 文件类型
   * @returns {boolean} 是否成功上传
   */
  async upload(path: string, data: NSData, contentType: string): Promise<boolean> {
    const resp = await this._request({
      method: 'PUT',
      path: path,
      isdir: false,
      headers: {
        'Content-Type': contentType
      },
      data: data
    })
    if (resp.response.statusCode === 404) {
      throw new WebDAVError({
        message: '上传目录不存在',
        statusCode: 404,
        type: 'http'
      })
    }
    return resp.response.statusCode < 400
  }

  /**
   * 下载文件
   * @param path 文件路径
   * @returns 
   */
  async download(path: string) {
    const resp = await this._request({
      method: 'GET',
      path: path,
      isdir: false
    })
    if (resp.response.statusCode < 300) {
      return resp.rawData
    } else {
      throw new WebDAVError({
        message: `下载文件失败`,
        statusCode: resp.response.statusCode,
        type: 'http'
      })
    }
  }

  /**
   * 删除文件或文件夹
   * @param path 文件或文件夹路径
   * @param isdir 是否是文件夹，默认根据路径结尾是否为`/`判断
   * @returns
   * 
   */
  async delete(path: string, isdir?: boolean) {
    if (isdir === undefined) {
      isdir = path.endsWith('/')
    }
    const resp = await this._request({
      method: 'DELETE',
      path: path,
      isdir
    })
    if (resp.response.statusCode < 300) {
      return true
    } else {
      throw new WebDAVError({
        message: `删除文件或文件夹失败`,
        statusCode: resp.response.statusCode,
        type: 'http'
      })
    }
  }

  /**
   * 移动文件或文件夹
   * @param from 源文件或文件夹路径
   * @param to 目标文件或文件夹路径
   * @param isdir 是否是文件夹
   * @returns 
   */
  async move(from: string, to: string, isdir: boolean) {
    const resp = await this._request({
      method: 'MOVE',
      path: from,
      isdir,
      headers: {
        "If-None-Match": null,
        Destination: this._baseURL + __URLEncode(to, isdir)
      }
    })
    if (resp.response.statusCode < 300) {
      return true
    } else {
      throw new WebDAVError({
        message: `移动文件或文件夹失败`,
        statusCode: resp.response.statusCode,
        type: 'http'
      })
    }
  }

  /**
   * 创建文件夹
   * @param path 文件夹路径
   * @returns 
   */
  async mkdir(path: string) {
    const resp = await this._request({
      method: 'MKCOL',
      path: path,
      isdir: true
    })
    if (resp.response.statusCode < 300) {
      return true
    } else {
      throw new WebDAVError({
        message: `创建文件夹失败`,
        statusCode: resp.response.statusCode,
        type: 'http'
      })
    }
  }

  async _request({ method, path, isdir, data, headers, timeout }: {
    method: string,
    path: string,
    isdir: boolean,
    data?: NSData,
    headers?: Record<string, any>,
    timeout?: number
  }) {
    const url = this._baseURL + __URLEncode(path, isdir);
    if (!headers) headers = {};
    if (this._auth) headers['Authorization'] = this._auth;
    const resp = await $http.request({
      url: url,
      method: method,
      header: headers,
      body: data,
      timeout: timeout || 30, // 默认超时时间30秒
    })
    if (resp.error) {
      if (resp.error.code === -1001) {
        throw new WebDAVError({
          message: '请求超时',
          type: 'timeout'
        })
      } else {
        throw new WebDAVError({
          message: "未知错误",
          type: 'other',
        })
      }
    }
    if (resp.response.statusCode === 400) {
      throw new WebDAVError({
        message: '400 Bad Request',
        type: 'http',
        statusCode: 400,
      })
    } else if (resp.response.statusCode === 401) {
      throw new WebDAVError({
        message: '401 Unauthorized',
        type: 'http',
        statusCode: 401,
      })
    } else if (resp.response.statusCode === 403) {
      throw new WebDAVError({
        message: '403 Forbidden',
        type: 'http',
        statusCode: 403,
      })
    } else if (resp.response.statusCode === 423) {
      throw new WebDAVError({
        message: '423 Locked',
        type: 'http',
        statusCode: 423,
      })
    } else if (resp.response.statusCode >= 400 && resp.response.statusCode < 500 && resp.response.statusCode !== 404) {
      // 排除404，因为404在某些情况下是正常的错误，不需要抛出异常
      throw new WebDAVError({
        statusCode: resp.response.statusCode,
        message: `${resp.response.statusCode}`,
        type: "http"
      })
    } else if (resp.response.statusCode >= 500 && resp.response.statusCode < 600) {
      throw new WebDAVError({
        message: `服务器错误`,
        type: 'http',
        statusCode: resp.response.statusCode,
      })
    }
    return resp;
  }
}