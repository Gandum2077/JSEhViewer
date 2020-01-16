# JSEhViewer

提升[exhentai.org](https://exhentai.org)在iOS平台的阅读体验，并尽情使用其强大的搜索、评分、收藏、评论等诸多功能！  
本应用基于JSBox平台。在功能上对标Android平台的EhViewer。另外，也选择在Pythonista 3平台的孪生应用[PyEhViewer](https://github.com/Gandum2077/PyEhViewer)。

## Features

- 自动翻页，解放左酱右酱
- 快捷搜索
- 高级搜索
- 边栏、搜索词收藏、直接打开url等快捷功能
- 标签翻译
- 打分、收藏、分享、评论
- 可以导入已缓存的旧版本，或者将旧版本导到新版本，方便追更新
- 缓存，缓存内容也可以搜索
- 自适应屏幕
- 阅读页面可以使用手势操作
- 更加规范和模块化的设计（相比于PyEhViewer），因此你可以在此开源代码之上添加想要的任何功能！

## 前提

这是本人为了欣赏艺术、提升欣赏艺术的体验才写的，因此很遗憾，可能不适合对艺术没有追求的人。  
本程序虽然前提设置有点复杂，但是程序本身的操作是一目了然的。

**你必须满足以下前提才能使用JSEhViewer:**

1. (必要) [JSBox](https://apps.apple.com/us/app/jsbox-learn-to-code/id1312014438)>=1.60.0
2. (必要) iPad，**不完全适配iPhone**
3. (必要) 可以访问[e-hentai.org](https://e-hentai.org)和[exhentai.org](https://exhentai.org)的网络环境
4. (必要) 注册[e-hentai.org](https://e-hentai.org)账号，并确保可以访问[exhentai.org](https://exhentai.org)（刚注册的账号需要等待两星期左右才能访问）  
然后请去[Hath Perks页面](https://e-hentai.org/hathperks.php)点亮Multi-Page Viewer的Hath Perk，需要300Hath币或者在[捐款页面](https://e-hentai.org/bitcoin.php)捐价值100美元的Bitcoin或Bitcoin Cash

5. [设置界面](https://exhentai.org/uconfig.php)做以下设置：

- (必要)Front Page Settings 设为 Extended
- (必要)Thumbnail Settings 中的 Size 设为 Large
- (可选)Gallery Name Display 设为 Japanese Title (if available)
- (可选)Search Result Count 设为 50 results。此功能需要Paging Enlargement I的Hath Perk

## 安装和更新

- 安装  
建议使用git进行安装。比如你可以用[gitCloneDownloader](https://github.com/Gandum2077/jsbox-gitclone-downloader)
也可以直接下载releases的源代码包并导入JSBox。

- 更新  
不删除原应用的情况下直接安装同名应用，JSBox不会删除用户自行添加的文件。因此，直接重装即可更新。

## 已知问题

- 请注意所有的数据库写入操作都是在图库关闭的时候进行的，所以如果不关闭图库就直接退出JSBox，那么这个图库就不会保存到数据库。

## TO-DO

- [ ] 适配iPhone
- [ ] 让没有 Multi-Page Viewer 权限的账号也能使用
- [ ] 缓存搜索支持‘-’号过滤语法
- [ ] 让游客也能使用


## Contributing
如果你想帮助本项目，请考虑以下方面：
- 针对iPhone的适配工作，需要将部分自定义控件针对iPhone进行界面和操作逻辑的重构
- 实现完整的配置功能，需要获取[设置界面](https://exhentai.org/uconfig.php)的完全解析
- 使本应用适用于没有Multi-Page Viewer权限的账号，需要parser模块的升级

## 截图
![0.png](https://github.com/Gandum2077/JSEhViewer/blob/master/assets/screenshots/0.png)  
![1.png](https://github.com/Gandum2077/JSEhViewer/blob/master/assets/screenshots/1.png)  
![2.png](https://github.com/Gandum2077/JSEhViewer/blob/master/assets/screenshots/2.png)  
![3.png](https://github.com/Gandum2077/JSEhViewer/blob/master/assets/screenshots/3.png)
