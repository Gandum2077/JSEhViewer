# WebDAV使用指南

启用WebDAV后，打开图库时会优先使用WebDAV中对应的图库。

建议配合H@H客户端使用，下面的规则以H@H客户端为基准。如果使用自定义下载器，需要遵守同样的规则。

## 如何设置

点击“新增WebDAV地址”添加地址。你需要填写URL、用户名、密码。

其中，URL需要包括协议、host、端口、路径，比如`http://192.168.1.1:6000/hath/download`


## WebDAV服务端目录&文件命名规则

> 如果你使用H@H客户端作为下载器，可以无视此章节。

### 目录命名规则

所有图库文件夹必须直接放在URL的给定路径下，比如URL是`http://192.168.1.1:6000/hath/download`，则所有图库文件夹都要放在`hath/download`中，不能以嵌套的方式存储。

图库文件夹接受两种命名方式：

1. 用GID命名，例如`1049306`，可以带上分辨率标识，例如`1049306-780x`
2. 在名字末尾加上用方括号包裹的GID，例如`水無月のほんとのチカラっ![1049306]`，可以带上分辨率标识。例如`水無月のほんとのチカラっ![1049306-780x]`

### 文件命名规则

序号做开头，后面用`.`或`_`连接其他内容。前面可以填充任意个字符`0`。比如`2_IMG_0002.jpg`或`2.jpg`或`002.jpg`。请注意，序号必须从1开始。

## 如何管理WebDAV服务器上的图库？

使用自己喜欢的文件管理器即可。推荐[CyberDuck](https://cyberduck.io/)。
