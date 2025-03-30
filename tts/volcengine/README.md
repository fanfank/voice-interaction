# TTS Demo

这是一个使用火山引擎 TTS 服务的演示项目，包含前端页面和本地代理服务器。

## 文件结构

- `index.html` - 前端页面，包含文本输入框和语音播放控件
- `main.js` - 前端 JavaScript 代码，处理用户交互和音频播放
- `proxy_server.py` - Python 代理服务器，用于解决跨域问题
- `README.md` - 本文档

## 安装依赖

### Python 依赖
```bash
pip install fastapi uvicorn httpx
```

## 使用方法

1. 启动代理服务器：
```bash
python proxy_server.py
```
服务器将在 http://127.0.0.1:8000 上运行

2. 在浏览器中打开 `index.html`

3. 在页面中填入必要信息：
   - APPID
   - Access Token
   - Cluster ID
   - 选择语音类型
   
4. 输入要转换的文本，点击"播放"按钮即可听到语音

## 注意事项

- 确保代理服务器运行时再使用前端页面
- 所有的 API 凭证信息（APPID、Token 等）请从火山引擎控制台获取
- 本项目仅用于演示用途，生产环境使用时请注意安全性配置 