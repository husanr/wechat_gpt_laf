// 引入必要的库
import * as crypto from 'crypto';
import cloud from '@lafjs/cloud';

// 创建数据库连接
const db = cloud.database();

// 校验微信服务器发送的消息是否合法
function verifySignature(signature, timestamp, nonce, token) {
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join('');
  const sha1 = crypto.createHash('sha1');
  sha1.update(str);
  return sha1.digest('hex') === signature;
}

// 返回组装xml
function toXML(payload, content) {
  const timestamp = Date.now();
  const { tousername: fromUserName, fromusername: toUserName } = payload;
  return `
  <xml>
    <ToUserName><![CDATA[${toUserName}]]></ToUserName>
    <FromUserName><![CDATA[${fromUserName}]]></FromUserName>
    <CreateTime>${timestamp}</CreateTime>
    <MsgType><![CDATA[text]]></MsgType>
    <Content><![CDATA[${content}]]></Content>
  </xml>
  `
}

// 处理接收到的消息
export async function main(event, context) {
  const { signature, timestamp, nonce, echostr } = event.query;
  const token = 'hello123';
  const { ChatGPTAPI } = await import('chatgpt')
  // 这里需要把 api 对象放入 cloud.shared 不然无法追踪上下文
  let api = cloud.shared.get('api')
  if (!api) {
    api = new ChatGPTAPI({ apiKey: "YOUR API-KEY" })
    cloud.shared.set('api', api)
  }
  console.log(event)
  
  // 验证消息是否合法，若不合法则返回错误信息
  if (!verifySignature(signature, timestamp, nonce, token)) {
    return 'Invalid signature';
  }

  // 如果是首次验证，则返回 echostr 给微信服务器
  if (echostr) {
    return echostr;
  }

  // 处理接收到的消息
  const payload = event.body.xml;
  console.log("payload",payload)
  
  // 查询数据库中是否有上一次的聊天记录
  const chatData = await db.collection('chat').where({data:{ id: payload.fromusername[0]}}).get();
  console.log("chatData",chatData)
  const lastMessage = chatData.data[chatData.data.length - 1];

  // 如果用户发送的是“1”，则返回上一次的聊天记录
  if (payload.content[0] === '1') {
    if(lastMessage) {
      await db.collection('chat').remove();
      return toXML(payload, lastMessage.data.message)
    } else {
      return toXML(payload, "输入太快咯，请稍后再输入‘1’来获取结果哦!")
    }
  }

  // 调用 ChatGPT API 进行聊天
  const startTime = Date.now();
  // console.log(startTime, "---", timestamp+"000")
  // 如果响应时间大于等于 5s，则返回提示信息给用户
  if(startTime - (timestamp+"000") > 5000) {
    const errMessage = "返回内容过长，请稍后回复‘1’以获取最新结果!"
    return toXML(payload, errMessage)
  }
  const response = await api.sendMessage(payload.content[0]);
  console.log("response",response)
  const endTime = Date.now();

  // 如果响应时间小于 5s，则直接返回结果给用户
  if (endTime - startTime < 5000) {
    return toXML(payload, response.text)
  }

  // 如果响应时间大于等于 5s，将结果存入数据库
  await db.collection('chat').add({ data: { message: response.text, id: payload.fromusername[0] } });

}
