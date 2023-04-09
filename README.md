# 使用Laf云平台，两步将ChatGPT接入微信公众号
**最近很火**的`ChatGPT`可以说已经满大街可见了，到处都有各种各样的体验地址，有收费的也有免费的，总之是五花八门、花里胡哨。

**所以呢**，最近我就在研究怎么才能方便快捷的体验到`ChatGPT`的强大功能，其中一个就是：把`ChatGPT`接入公众号。如下图（成果图）:


![](https://files.mdnice.com/user/24883/e98247d1-fdba-49f8-8cb9-55a1c8a92d1b.jpg)

![欢迎关注体验](https://files.mdnice.com/user/24883/d549421c-6c0e-4239-896b-044bd7667604.png)

下面我来介绍一下具体怎么实现：
#### 1. 首先注册一个Laf平台账号
laf官网：https://laf.dev

注册登录之后，点击新建，建立一个应用

![新建应用](https://files.mdnice.com/user/24883/39050afd-7485-43c9-a301-be4aeea6cec6.jpg)

输入应用名称，点击立即创建

![立即创建](https://files.mdnice.com/user/24883/a6c9a86f-2b52-4a02-87e6-25e58b5a48e6.jpg)

点击开发，进入应用开发界面

![点击开发](https://files.mdnice.com/user/24883/7a08b487-311f-4a00-8a3b-18402eda3f6d.jpg)

然后先把chatgpt的依赖安装一下

![安装依赖](https://files.mdnice.com/user/24883/62fce326-7358-492f-ae70-e60e31a8813d.jpg)

点击加号，搜索chatgpt，选中第一个，点击安装并重启

![搜索并安装chatgpt依赖](https://files.mdnice.com/user/24883/af8d5358-1a18-4d77-b961-dedfd14984fa.jpg)

然后我们点击函数，函数列表右侧的加号，新增一个可以介入微信公众号的chatgpt云函数

![点击新增](https://files.mdnice.com/user/24883/14dbf34d-437d-413c-898e-01cd0ee8d9bc.png)

输入函数名，点击确定

![新增云函数](https://files.mdnice.com/user/24883/b8f562e5-a312-412a-b515-6269473eb68d.png)

云函数代码如下：
```js
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
```
注意： 
1. `token`要与微信公众号中设置一致
2. `chatGPT`的`apiKey`要从openai官网获取，地址如下：`https://platform.openai.com/account/api-keys`

云函数写完之后就点击发布，左侧的接口地址要保存一下，一会微信公众号那里要用

![发布云函数](https://files.mdnice.com/user/24883/fa5cb86b-b324-4179-8749-21e7392121d2.png)

到这里，在Laf平台的操作基本结束。

#### 2. 第二步在微信公众平台操作
首先默认你有一个公众号，然后登录微信公众平台，点开左侧的设置与开发，点击基本设置，服务器配置那里点击修改配置

![修改配置](https://files.mdnice.com/user/24883/a081c7f0-14b4-426e-ad35-3ad10fb1aacc.png)

把刚才保存的接口地址复制到服务器URL这里，下边的token与云函数代码中的token保持一致，下边的EncodingAESKey点击右侧随机生成就行，然后点击提交

![提交配置](https://files.mdnice.com/user/24883/678f0993-7411-4088-9834-db6484f8014b.png)

返回token校验成功的话，我们就点击启用

![启用服务器配置](https://files.mdnice.com/user/24883/2a966f68-be98-4579-b852-b1db6f5f1e79.png)


启用成功之后就可以在公众号对话框与ChatGPT对话啦，快去试试吧！附在下公众号，点击关注即可体验！









