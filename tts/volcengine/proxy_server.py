from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import httpx
import uvicorn

app = FastAPI()

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该设置具体的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/proxy/tts")
async def proxy_tts(request: Request):
    # 获取原始请求的内容和头信息
    body = await request.json()
    auth_header = request.headers.get('Authorization')

    # 准备发送到 TTS 服务器的请求
    headers = {
        'Authorization': auth_header,
        'Content-Type': 'application/json'
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                'https://openspeech.bytedance.com/api/v1/tts',
                json=body,
                headers=headers
            )
            
            # 创建响应头，但移除可能导致解码问题的头
            response_headers = dict(response.headers)
            # 移除内容编码相关的头，让浏览器直接处理未压缩的内容
            response_headers.pop('content-encoding', None)
            response_headers.pop('transfer-encoding', None)
            
            return Response(
                # 使用已经解码的内容
                content=response.content,
                status_code=response.status_code,
                headers=response_headers,
                media_type=response.headers.get('content-type')
            )
        except Exception as e:
            return Response(
                content=str(e),
                status_code=500
            )

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000) 