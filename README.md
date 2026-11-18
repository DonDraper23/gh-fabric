# GH-Fabric 官网

客户使用 `https://gh-fabric.com/`。网站由 Cloudflare Workers Static Assets 提供，页面、样布图和分享封面一起发布。编辑内容的地址是 `https://ghfabriccom.wordpress.com/wp-admin/edit.php?post_type=page`。

## 日常上新

1. 在 WordPress 的「页面」中点击「添加页面」，标题写面料名和真实款号。可将产品照设为「特色图片」，或直接插入正文。写清已确认的成分、克重、门幅等信息。
2. 发布页面。带图的公开页面会出现在首页面料目录中，原有 `new collection` 作为档案页。详情页取用公开正文，普通产品页会自动生成带该款标题的 WhatsApp 索样按钮。
3. 更新已有页面时继续使用原条目。保留原别名可以让从社交平台分享出去的链接继续使用。草稿、私密和密码保护的页面不会进入构建。

## 发布和恢复

`npm ci && npm run build && npm run check` 会从公开的 WordPress 内容生成 `dist/`。生成器把本站媒体库的图片下载并转换成适合手机的图片和社交分享封面。发布前检查目录链接、规范网址、图片和 WhatsApp 号码。内容或图片获取失败时构建失败，线上继续使用上一次成功版本。

WordPress 的 `publish_page` 通知会启动 “Publish GH-Fabric”。通知只带页面编号及修改时间，网站从 WordPress 公开内容生成。另有每 15 分钟计划执行的核对，用于补上漏发通知、撤回和首页模板修改，实际时间取决于 GitHub 排队。需要立即发布时，在该流程点击 “Run workflow”。主分支里的站点代码更新也会触发构建。部署凭据存于此仓库的加密设置中，授权范围仅限 Cloudflare 上的 `gh-fabric`。

每次部署后会从正式域名回读页面、图片、WhatsApp 链接和 www 跳转。发布系统另外每周复查一次，把最新通过验证的月份及版本写入仓库，方便长期核对。

发布通知的接收地址保存在 WordPress 后台的 [Webhooks 设置](https://ghfabriccom.wordpress.com/wp-admin/options-general.php?page=webhooks)。对应的 GitHub 凭据只限本仓库的 Actions；它和通知校验值储存在此 Worker 的加密设置中。访客访问页面与图片时继续使用静态托管。

网站的旧跳转规则名为 `Restore WordPress website`。如果需要恢复旧站，可以在 Cloudflare 重新启用这条规则。域名邮箱记录和卫浴站单独管理。
