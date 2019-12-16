# JSEhViewer

本应用尚在开发，进度估计在30%～40%。

## 使用方法
本应用的使用要求和[PyEhViewer](https://github.com/Gandum2077/PyEhViewer)完全一致。当然了，这边需要的是JSBox而非Pythonista 3。  
登录页面还没有做，请先在[PyEhViewer](https://github.com/Gandum2077/PyEhViewer)登录，把里面的登录信息（`parse/account.json`, `parse/cookie.json`）和配置信息（`conf/config.json`）拷贝到这边的`assets`目录下，就可以使用了。

## 开发计划
- 功能方面，实现[PyEhViewer](https://github.com/Gandum2077/PyEhViewer)的所有功能
- 界面方面，双方UI实践逻辑有所不同，因此不强求UI完全统一。（比如已经计划放弃实现PyEhViewer的Gallery页面，改为Thumbnails需要额外加载一个专门页面、其他infos留在原处但不能滚动的方式。当然如果有大佬知道如何实现，可以提点我一下）