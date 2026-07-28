# 关于 GitHub Token

如果你在检查更新或者更新标签翻译时遇到 GitHub API 限流问题(429错误)，请通过填入 GitHub Fine-grained personal access tokens 来解决。

> 参见GitHub 官方文档：[GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

## 第一步：进入 Token 管理页面

[点击进入创建 Token 页面](https://github.com/settings/personal-access-tokens/new)

或者在 GitHub 依次进入：

```
Settings
    ↓
Developer settings
    ↓
Personal access tokens
    ↓
Fine-grained tokens
    ↓
Generate new token
```

---

## 第二步：填写信息

1. Token name：随便起一个名字
2. Resource owner：保持默认（即自己）
3. Expiration：建议 No expiration
4. Repository access：Public Repositories
5. Permissions：不需要添加任何权限

---

## 第三步：生成 Token

点击`Generate token`，GitHub 会显示一次：

```
github_pat_xxxxxxxxxxxxxxxxxxxxx
```

请立即复制保存，之后将**无法再次查看**，如果遗失需要重新生成。

然后填入本应用中即可。
