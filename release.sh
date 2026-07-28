#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BUMP="${1:-patch}"
RELEASE_NOTE="${2:-}"

case "$BUMP" in
  patch|minor|major|[0-9]*.[0-9]*.[0-9]*) ;;
  *)
    echo "用法: ./release.sh [patch|minor|major|x.y.z] [发布说明]"
    exit 1
    ;;
esac

for command_name in git node npm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "缺少命令: $command_name"
    exit 1
  fi
done

BRANCH="$(git branch --show-current)"
if [[ -z "$BRANCH" ]]; then
  echo "当前处于 detached HEAD，不能发布。"
  exit 1
fi

if git diff --name-only --diff-filter=U | grep -q .; then
  echo "存在尚未解决的 Git 冲突，不能发布。"
  exit 1
fi

echo "正在同步远端标签..."
FETCHED=0
for attempt in 1 2 3; do
  if git -c http.version=HTTP/1.1 fetch origin "$BRANCH" --tags; then
    FETCHED=1
    break
  fi
  echo "连接 GitHub 失败（第 $attempt/3 次），稍后自动重试..."
  sleep $((attempt * 2))
done

if [[ "$FETCHED" != "1" ]]; then
  echo "连续 3 次无法连接 GitHub，请检查网络后重新运行脚本。"
  exit 1
fi

if ! git merge-base --is-ancestor "origin/$BRANCH" HEAD; then
  echo "远端 $BRANCH 包含本地尚未合并的提交。"
  echo "请先执行 git pull --rebase --autostash，再重新运行发布脚本。"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

echo "正在更新版本号..."
CURRENT_VERSION="$(node -p "require('./package.json').version")"
if [[ "$BUMP" == "$CURRENT_VERSION" ]]; then
  VERSION="$CURRENT_VERSION"
else
  npm version "$BUMP" --no-git-tag-version
  VERSION="$(node -p "require('./package.json').version")"
fi
TAG="v$VERSION"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "版本标签 $TAG 已存在，请选择更高的版本号。"
  exit 1
fi

echo "正在执行发布前检查..."
npm run typecheck
npm test
npm run build:app

# 这些目录是本地验证产物，不进入发布提交；GitHub Actions 会重新构建。
git restore --worktree -- dist node_modules/.package-lock.json 2>/dev/null || true

git add -u
while IFS= read -r -d '' file_path; do
  git add -- "$file_path"
done < <(git ls-files --others --exclude-standard -z)

if git diff --cached --quiet; then
  echo "没有可以发布的代码变更。"
  exit 1
fi

echo
echo "即将发布 $TAG，包含以下变更："
git diff --cached --stat
echo

if [[ "${RELEASE_YES:-0}" != "1" ]]; then
  read -r -p "确认提交并发布到 GitHub？[y/N] " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "已取消。版本号改动保留在工作区。"
    exit 0
  fi
fi

COMMIT_MESSAGE="release: $TAG"
if [[ -n "$RELEASE_NOTE" ]]; then
  COMMIT_MESSAGE="$COMMIT_MESSAGE - $RELEASE_NOTE"
fi

git commit -m "$COMMIT_MESSAGE"
git tag -a "$TAG" -m "${RELEASE_NOTE:-Release $TAG}"
git push --atomic origin "$BRANCH" "$TAG"

REPOSITORY_URL="$(git remote get-url origin | sed -E 's#git@github.com:#https://github.com/#; s#\.git$##')"
echo
echo "已推送 $TAG。GitHub 正在并行生成 Windows 和 macOS 安装包："
echo "$REPOSITORY_URL/actions"
echo
echo "完成后可在这里下载安装包："
echo "$REPOSITORY_URL/releases/tag/$TAG"
