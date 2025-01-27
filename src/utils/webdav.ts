/**
 * WebDAV客户端的JSBox实现
 * 仅支持基本功能：列出文件、上传文件、下载文件、删除文件、移动文件、创建文件夹
 * 支持的认证方式：无、基本认证
 * 
 */

import * as cheerio from 'cheerio'

function __URLEncode(path: string) {
  if (!path) return ''
  // 合并多个斜杠
  path = path.replace(/\/+/g, '/')
  // remove leading and trailing slashes
  if (path.startsWith('/')) path = path.slice(1)
  if (path.endsWith('/')) path = path.slice(0, -1)
  return path.split('/').map(text => $text.URLEncode(text)).join('/')
}

export class JBWebDAV {
  private _auth?: string
  private _baseURL: string
  constructor({ url, username, password }: { url: string, username?: string, password?: string }) {
    if (username && password) {
      this._auth = "Basic " + $text.base64Encode(username + ":" + password)
    }
    if (!url.endsWith('/')) url += '/'
    this._baseURL = url
  }

  async exists(path: string) {
    const resp = await this._request({
      method: 'PROPFIND',
      path: path,
      headers: {
        'Depth': "0"
      }
    })
    return resp.response.statusCode < 400
  }

  async list(path: string) {
    const resp = await this._request({
      method: 'PROPFIND',
      path: path,
      headers: {
        'Depth': "1"
      }
    })
    if (resp.response.statusCode >= 400) return
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
      const name = $text.URLDecode(href.split('/').at(-1) || '');
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

  async upload(path: string, data: NSData, contentType: string) {
    const resp = await this._request({
      method: 'PUT',
      path: path,
      headers: {
        'Content-Type': contentType
      },
      data: data
    })
    if (resp.response.statusCode === 201) return true
    else return false
  }

  async download(path: string) {
    const resp = await this._request({
      method: 'GET',
      path: path
    })
    if (resp.response.statusCode === 200) return resp.data
    else return null
  }

  async delete(path: string) {
    const resp = await this._request({
      method: 'DELETE',
      path: path
    })
    if (resp.response.statusCode === 204) return true
    else return false
  }

  async move(from: string, to: string) {
    const resp = await this._request({
      method: 'MOVE',
      path: from,
      headers: {
        "If-None-Match": null,
        Destination: this._baseURL + __URLEncode(to)
      }
    })
    if (resp.response.statusCode === 201) return true
    else return false
  }

  async mkdir(path: string) {
    const resp = await this._request({
      method: 'MKCOL',
      path: path
    })
    if (resp.response.statusCode === 201) return true
    else return false
  }

  async _request({ method, path, data, headers }: {
    method: string,
    path: string,
    data?: NSData,
    headers?: Record<string, any>
  }) {
    const url = this._baseURL + __URLEncode(path)
    if (!headers) headers = {}
    if (this._auth) headers['Authorization'] = this._auth
    const resp = await $http.request({
      url: url,
      method: method,
      header: headers,
      body: data
    })
    if (resp.error) throw new Error("WebDAV request failed: " + resp.error.localizedDescription)
    return resp
  }
}