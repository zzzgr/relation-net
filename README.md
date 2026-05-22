# 人物关系网 · Relation Net

把家人、亲戚、朋友、同事录进来，从 **家族树 / 关系图 / 地图 / 时光轴** 四个维度回看人际网络。

技术栈：React + Vite + TypeScript + Ant Design 5 + Tailwind v4 + 高德地图，部署到 Cloudflare Workers + D1。

## 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zzzgr/relation-net)

点击按钮 → 登录 Cloudflare 和 GitHub → 授权后等待约 1 分钟完成部署。

部署完成后访问分配的 `*.workers.dev` 域名：

- **默认密码：`admin`**
- 登录后请立即在「设置」页修改密码

## 功能

- **人物管理**：姓名 / 称谓 / 性别 / 出生日期（阳历或农历）/ 头像 / 地址 / 备注 / 多手机号
- **关系**：父母 / 配偶 / 社会关系，兄弟姐妹、堂表、叔伯姑舅姨等旁系姻亲全部自动派生
- **家族树**：多棵独立树，卡片网格 + 族谱图，移动端适配
- **关系图**：力导向图，拖拽缩放，双击切换中心人物
- **地图**：高德地图聚合标点 + 信息卡片
- **大事记**：事件 + 主角 + 参与人 + 图片视频，时间轴 / 地图双视图
- **提醒**：阳历 / 农历生日、周年纪念日聚合提醒
- **分类**：事件类型、社会关系自定义图标和颜色
- **分享**：家族树或单人资料卡只读分享，独立密码 + 有效期
- **备份**：导出 JSON / 推送到 S3 兼容存储 / 从备份恢复
- **回收站**：软删除 + 恢复 + 彻底清除

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars   # 编辑 APP_PASSWORD 和 SESSION_SECRET
npm run db:migrate:local         # 初始化本地数据库

# 两个终端分别启动
npm run dev:worker               # 后端 http://localhost:8787
npm run dev                      # 前端 http://localhost:5173
```

打开 http://localhost:5173，默认密码 `admin`（或 `.dev.vars` 中自定义的值）。高德 Key 和 S3 存储在应用内「设置」页配置。

### 加载 Demo 数据

```bash
npm run demo              # 本地加载 demo 数据
npm run demo:remote       # 远端加载 demo 数据
```

## 许可

MIT
