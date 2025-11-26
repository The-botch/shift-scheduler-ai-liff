# Claude Instructions

## ブランチ作成ポリシー

特別な指示がない限り、新しいブランチを作成する際は最新の `staging` ブランチから切り出してブランチを作成すること。

```bash
git checkout staging
git pull origin staging
git checkout -b <new-branch-name>
```
