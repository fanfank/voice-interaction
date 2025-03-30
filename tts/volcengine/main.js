document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('inputText');
    const playButton = document.getElementById('playButton');
    const appId = document.getElementById('appId');
    const accessToken = document.getElementById('accessToken');
    const clusterId = document.getElementById('clusterId');
    const voiceType = document.getElementById('voiceType');
    
    let audioContext;
    let audioQueue = [];
    let isPlaying = false;
    let ws = null;

    // 以下的工具函数并不都使用，有些是尝试使用 WebSocket 时引入的

    async function compressUint8Array(uint8Array) {
        return new Uint8Array(await new Response(new Blob([uint8Array]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    }
      
    async function decompressUint8Array(compressedUint8Array) {
        return new Uint8Array(await new Response(new Blob([compressedUint8Array]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    }

    async function compressString(str) {
        // Convert the string to a byte stream.
        const stream = new Blob([str]).stream();
      
        // Create a compressed stream.
        const compressedStream = stream.pipeThrough(
          new CompressionStream("gzip")
        );
      
        // Read all the bytes from this stream.
        const chunks = [];
        for await (const chunk of compressedStream) {
          chunks.push(chunk);
        }
        return await concatUint8Arrays(chunks);
    }

    async function decompressToString(compressedBytes) {
        // Convert the bytes to a stream.
        const stream = new Blob([compressedBytes]).stream();
      
        // Create a decompressed stream.
        const decompressedStream = stream.pipeThrough(
          new DecompressionStream("gzip")
        );
      
        // Read all the bytes from this stream.
        const chunks = [];
        for await (const chunk of decompressedStream) {
          chunks.push(chunk);
        }
        const stringBytes = await concatUint8Arrays(chunks);
      
        // Convert the bytes to a string.
        return new TextDecoder().decode(stringBytes);
    }

    function concatUint8Arrays(uint8arrays) {
        const totalLength = uint8arrays.reduce(
          (total, uint8array) => total + uint8array.byteLength,
          0
        );
      
        const result = new Uint8Array(totalLength);
      
        let offset = 0;
        uint8arrays.forEach((uint8array) => {
          result.set(uint8array, offset);
          offset += uint8array.byteLength;
        });
      
        return result;
    }

    function printBytes(bytes) {
        console.log('Bytes dump:\n' + Array.from(bytes)
            .map((byte, index) => `[${index.toString().padStart(4, '0')}] 0x${byte.toString(16).padStart(2, '0')}`)
            .join('\n'));
    }

    // 初始化 AudioContext
    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    // 生成 UUID
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Deprecated: JS 无法调用火山引擎 WebSocket 接口
    // 处理音频数据并播放
    async function processAudioData(audioData) {
        // 预期输入: audioData 是火山引擎 WebSocket 协议下返回的二进制数据
        // 返回: 解析后可以直接播放的 AudioBuffer
        let protocolVersion = audioData[0] >> 4;
        let headerSize = audioData[0] & 0x0f;
        let messageType = audioData[1] >> 4;
        let messageTypeSpecificFlags = audioData[1] & 0x0f;
        let serializationMethod = audioData[2] >> 4;
        let messageCompression = audioData[2] & 0x0f;
        let reserved = audioData[3];
        let headerExtensions = audioData.slice(4, headerSize * 4);
        let payload = audioData.slice(headerSize * 4);

        console.log(
            "Protocol parsing result:\n",
            "- Protocol Version:", protocolVersion, "\n",
            "- Header Size:", headerSize, "\n",
            "- Message Type:", messageType, "\n",
            "- Message Flags:", messageTypeSpecificFlags, "\n",
            "- Serialization Method:", serializationMethod, "\n",
            "- Message Compression:", messageCompression, "\n",
            "- Reserved:", reserved, "\n",
            "- Header Extensions:", Array.from(headerExtensions).map(b => b.toString(16).padStart(2, '0')).join(' ')
        );

        if (messageType == 0xb) {
            if (messageTypeSpecificFlags == 0) {
                console.log('No sequence number as ACK');
                return {audioBuffer: null, done: false};
            }

            let sequenceNumber = payload.readInt32BE(0);
            let payloadSize = payload.readUInt32BE(4);
            payload = payload.slice(8);
            console.log('Sequence number:', sequenceNumber);
            console.log('Payload size:', payloadSize);
            return {audioBuffer: payload, done: false};
            if (sequenceNumber < 0) {
                return {audioBuffer: payload, done: true};
            } else {
                return {audioBuffer: payload, done: false};
            }
        } else if (messageType == 0xf) {
            let code = payload.readUInt32BE(0);
            let msgSize = payload.readUInt32BE(4);
            let errorMsg = payload.slice(8);
            if (messageCompression == 1) {
                errorMsg = await decompressUint8Array(errorMsg);
            }
            errorMsg = new TextDecoder().decode(errorMsg);
            console.log('Error details - code:', code, 'size:', msgSize, 'message:', errorMsg);
            return {audioBuffer: null, done: true};
        } else if (messageType == 0xc) {
            let msgSize = payload.readUInt32BE(0);
            payload = payload.slice(4);
            if (messageCompression == 1) {
                payload = await decompressUint8Array(payload);
            }
            console.log('Frontend message:', new TextDecoder().decode(payload));
            return {audioBuffer: null, done: false};
        } else {
            console.log('Undefined message type:', messageType);
            return {audioBuffer: null, done: true};
        }
    }

    // Deprecated: JS 无法调用火山引擎 WebSocket 接口
    // 初始化 WebSocket 连接
    function initWebSocket() {
        // DO Nothing, websocket can not send headers
        // Example from volcengine does not apply to JS
        console.log('initWebSocket is deprecated');
        return;

        ws = new WebSocket('wss://openspeech.bytedance.com/api/v1/tts/ws_binary');
        
        ws.onopen = () => {
            console.log('WebSocket 连接已建立');
        };

        ws.onmessage = async (event) => {
            try {
                const audioData = event.data;
                const {audioBuffer, done} = await processAudioData(audioData);

                if (audioBuffer) {
                    audioQueue.push(audioBuffer);
                    if (!isPlaying) {
                        playNextInQueue();
                    }
                }

                if (done) {
                    console.log('音频数据接收完成');
                }
                
            } catch (error) {
                console.error('处理音频数据时出错:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket 错误:', error);
        };

        ws.onclose = () => {
            console.log('WebSocket 连接已关闭');
            // 尝试重新连接
            setTimeout(initWebSocket, 3000);
        };
    }

    // Deprecated: JS 无法调用火山引擎 WebSocket 接口
    // 发送 TTS 请求
    async function sendWebsocketTTSRequest(text) {
        console.log('sendWebsocketTTSRequest is deprecated');
        return;

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            alert('WebSocket 连接未建立，请稍后重试');
            return;
        }

        // 验证必要的参数
        if (!appId.value || !accessToken.value || !clusterId.value) {
            alert('请填写 APPID、Access Token 和 Cluster ID');
            return;
        }

        const defaultHeaderBytes = new Uint8Array([0x11, 0x10, 0x11, 0x00]);

        let reqid = generateUUID();
        let submitRequestJson = {
            "app": {
                "appid": appId.value,
                "token": accessToken.value,
                "cluster": clusterId.value
            },
            "user": {
                "uid": "46769394"
            },
            "audio": {
                "voice_type": voiceType.value,
                "encoding": "mp3",
                "speed_ratio": 1.0,
                "volume_ratio": 1.0,
                "pitch_ratio": 1.0,
            },
            "request": {
                "reqid": reqid,
                "text": text,
                "text_type": "plain",
                "operation": "submit"
            }
        };

        let payloadBytes = await compressString(JSON.stringify(submitRequestJson));
        let payloadBytesLength = payloadBytes.length;
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setUint32(0, payloadBytesLength, false);
        let payloadBytesLengthBytes = new Uint8Array(buffer);

        let fullClientRequest = concatUint8Arrays([defaultHeaderBytes, payloadBytesLengthBytes, payloadBytes]);
        console.log('Sending request:', JSON.stringify(submitRequestJson), "\nPayload length:", payloadBytesLength);
        printBytes(fullClientRequest.slice(0, 8));
        ws.send(fullClientRequest);
    }

    // 发送 TTS 请求
    async function sendTTSRequest(text) {
        // 验证必要的参数
        if (!appId.value || !accessToken.value || !clusterId.value) {
            alert('请填写 APPID、Access Token 和 Cluster ID');
            return;
        }

        let reqid = generateUUID();
        let submitRequestJson = {
            "app": {
                "appid": appId.value,
                "token": accessToken.value,
                "cluster": clusterId.value
            },
            "user": {
                "uid": "46769394"
            },
            "audio": {
                "voice_type": voiceType.value,
                "encoding": "mp3",
                "speed_ratio": 1.0,
                "volume_ratio": 1.0,
                "pitch_ratio": 1.0,
            },
            "request": {
                "reqid": reqid,
                "text": text,
                "text_type": "plain",
                "operation": "query"
            }
        };

        console.log('Sending request:', JSON.stringify(submitRequestJson));

        try {
            const response = await fetch('http://127.0.0.1:8000/proxy/tts', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer;${accessToken.value}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(submitRequestJson)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const jsonResponse = await response.json();
            console.log('json response:', jsonResponse);

            if (jsonResponse.code != 3000) {
                throw new Error(`TTS Error! code: ${jsonResponse.code}, message: ${jsonResponse.message}`);
            }

            // 解码 base64 音频数据
            const audioData = jsonResponse.data;
            const binaryString = atob(audioData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // 直接从 MP3 数据创建 AudioBuffer
            const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
            
            // 播放音频
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0);

        } catch (error) {
            console.error('发送请求失败:', error);
            alert('发送请求失败，请检查网络连接和参数配置');
        }
    }

    // 播放音频队列中的下一个片段
    function playNextInQueue() {
        if (audioQueue.length === 0) {
            isPlaying = false;
            return;
        }

        isPlaying = true;
        const audioBuffer = audioQueue.shift();
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        
        source.onended = () => {
            playNextInQueue();
        };

        source.start(0);
    }

    // 绑定按钮点击事件
    playButton.addEventListener('click', () => {
        let text = inputText.value.trim();
        if (!text) {
            alert('请输入要转换的文本');
            return;
        }

        initAudioContext();
        audioQueue = []; // 清空队列
        isPlaying = false;
        sendTTSRequest(text);
    });

    //// 页面加载完成时初始化 WebSocket 连接
    //initWebSocket();
});
