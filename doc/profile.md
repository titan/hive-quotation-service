# Profile 模块

## 数据结构

### UserInformation

|name|type|note|
|----|----|----|
|id|uuid|用户 ID|
|openid|string|openid|
|passsword|string|密码|
|name|string|姓名|
|gender|string|性别|
|identity-no|string|身份证|
|phone|string|手机号|
|nickname|string|昵称|
|portrait|string|头像|


## 接口

### 获得用户信息 getUserInfo

#### request

|name|type|note|
|----|----|----|
|id|uuid|用户 ID|

##### example

```javascript

var uid = ["00000000-0000-0000-0000-000000000000"];
rpc.call("profile", "getUserInformation", uid)
  .then(function (result) {

  }, function (error) {
        
  });
```

#### response

|name|type|note|
|----|----|----|

See [example](../data/profile/getUserInformation.json)

### 添加用户信息 setUserInfo

##### example

```javascript

var openid = "";
var gender = "";
var nickname = "";
var portrait = "";

rpc.call("profile", "getUserInformation", openid, gender, nickname, portrait)
  .then(function (result) {

  }, function (error) {
        
  });
```





