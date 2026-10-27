# 托班小记

给家长使用的托班出勤与按日计费 PWA，不需要 Apple 开发者账号。

## 本地开发

需要 Node.js 20.19+ 或 22.12+。

```sh
npm install
npm run dev
```

终端会显示电脑预览地址及局域网地址。Windows 防火墙需要允许该开发端口。手机和电脑在同一 Wi-Fi 下可通过局域网地址预览，但普通 HTTP 局域网地址不满足 iOS 离线 PWA 的安全上下文要求。

## 部署到 GitHub Pages

项目已包含 `.github/workflows/deploy-pages.yml`，会在推送到 `main` 后自动测试、构建和发布。工作流从 GitHub Pages 配置自动读取路径，支持普通项目页、用户名主页以及自定义域名，不需要手动填写仓库名。

1. 在 GitHub 新建一个公开仓库，例如 `daycare-ledger`。为便于首次推送，不勾选自动生成 README、许可证和 gitignore。GitHub Free 使用公开仓库即可免费启用 Pages；网站及源码公开，但考勤数据不会自动上传。
2. 在仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
3. 本地终端在项目目录执行下列命令，将 `YOUR_NAME` 替换成自己的 GitHub 用户名，仓库名替换成实际名称。以下按尚未初始化 Git 的项目编写；已有仓库不要重复添加 `origin`。

```powershell
git init
git branch -M main
git add .
git commit -m "Initial daycare ledger"
git remote add origin https://github.com/YOUR_NAME/daycare-ledger.git
git push -u origin main
```

首次推送可能要求登录 GitHub，请在 Git 或浏览器的登录窗口完成，不要把密码或令牌写进代码。

4. 打开仓库 **Actions → Deploy to GitHub Pages**，等待部署完成。若初次推送时尚未开启 Pages，可在开启后到 Actions 里选择 **Run workflow** 手动重跑。
5. 在 **Settings → Pages** 查看最终网址，普通项目页通常为 `https://YOUR_NAME.github.io/daycare-ledger/`。以后修改代码并推送到 `main` 就会自动更新。

`node_modules`、`dist` 和测试产物已在 `.gitignore` 中排除。不要提交实际考勤备份文件。GitHub Pages 不提供访问密码或账号保护，任何拿到网址的人都能打开空白账本，但不会因此看到其他设备的本地记录。

从本地预览切换到线上地址后，属于不同网站来源，本地记录不会自动搬过去；请先导出 JSON 备份，再在线上地址恢复。

## 安装到 iPhone

1. iPhone 使用 Safari 打开部署得到的 HTTPS 地址，选择“分享 → 添加到主屏幕 → 添加”。
2. 从主屏幕图标打开，联网访问一次，等待“离线账本已就绪”，之后即可离线记录。

也可运行 `npm run build`，将 `dist` 部署到其他 HTTPS 静态托管的根路径。默认构建路径为 `/`；本地模拟 GitHub 项目页时，可先在 PowerShell 执行 `$env:BASE_PATH='/daycare-ledger/'` 再构建，完成后用 `Remove-Item Env:BASE_PATH` 清除变量。

第一次从 Safari 转到主屏幕 App 后，先检查记录是否存在；不同 iOS 版本或打开方式可能有独立存储，需要时通过导出、恢复备份迁移。不要把无痕浏览当作长期保存方式。

## 使用与计费

- 先在设置中填写孩子小名和每日托费。初始单价为 100 元，首页会显示当前单价。
- 点击日历日期，选择已上或未上，也可修改当天费用并填写备注。未来日期不可记录。
- 只有“已上”计费，“未上”和“未记录”均不计费；清除记录恢复为未记录。
- 金额以整数分存储。每天保留当时单价，修改默认价格不会重算历史记录。
- 月度账单按日历月统计，可导出 CSV。费用表示按出勤计算的应付金额，不包含已付款、欠费或退款管理。
- JSON 备份包含全部记录和设置。恢复会替换当前全部数据，导入前会校验并要求确认。
- 没有登录和云同步；数据保存在当前来源、当前浏览器的 localStorage。清理网站数据、卸载或更换设备都可能丢失数据，请定期导出 JSON 备份。CSV 账单不能用于恢复。
- 页面字体可联网加载，断网时使用本机中文字体，不影响记录功能。

## 验证

```sh
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

浏览器测试覆盖手机与桌面、出勤计费、历史价格、月份切换、备份恢复、异常数据保护及 Chromium 离线加载。WebKit 测试不替代真机 Safari 安装验证，自动化 WebKit 不支持本项目的 Service Worker 测试。