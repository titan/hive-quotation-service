# Profile 模块

## 数据结构

### user

| name        | type    | note    |
| ----        | ----    | ----    |
| id          | uuid    | 用户 ID  |
| openid      | string  | openid  |
| passsword   | string  | 密码     |
| name        | string  | 姓名     |
| gender      | string  | 性别     |
| identity\_no| string  | 身份证   |
| phone       | string  | 手机号   |
| nickname    | string  | 昵称     |
| portrait    | string  | 头像     |

## 数据库结构

### users

| field           | type       | null | default | index   | reference |
| ----            | ----       | ---- | ----    | ----    | ----      |
| id              | uuid       |      |         | primary |           |
| openid          | char(28)   |      |         |         |           |
| passsword       | char(32)   |   ✓  |         |         |           |
| name            | char(64)   |   ✓  |         |         |           |
| gender          | char(4)    |   ✓  |         |         |           |
| identity\_no    | char(18)   |   ✓  |         |         |           |
| phone           | char(16)   |   ✓  |         |         |           |
| nickname        | char(64)   |   ✓  |         |         |           |
| portrait        | char(1024) |   ✓  |         |         |           |
| created\_at     | timestamp  |      | now     |         |           |
| updated\_at     | timestamp  |      | now     |         |           |

## 接口

### 获得用户信息 getUserInfo

#### request

| name    | type   | note    |
| ----    | ----   | ----    |

##### example

```javascript

rpc.call("profile", "getUserInfo")
  .then(function (result) {

  }, function (error) {
        
  });
```

#### response

| name   | type   | note     |
| ----   | ----   | ----     |
| code   | int    | 结果编码  |
| msg    | string | 结果内容  |

| code  | msg      | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功     |
| other | 错误信息  | 失败     |

See 成功返回数据：[example](../data/profile/getUserInfo.json)

### 获得用户openid getUserOpenId

#### request

| name | type | note    |
| ---- | ---- | ----    |
| uid  | uuid | 用户 ID |

##### example

```javascript

var uid = "00000000-0000-0000-0000-000000000001"
rpc.call("profile", "getUserOpenId", uid)
  .then(function (result) {

  }, function (error) {
        
  });
```

#### response

| name   | type   | note     |
| ----   | ----   | ----     |
| code   | int    | 结果编码  |
| msg    | string | 结果内容  |

| code  | msg      | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功     |
| other | 错误信息  | 失败     |

See 成功返回数据：[example](../data/profile/getUserOpenId.json)

### 添加用户信息 addUserInfo

#### request

| name    | type   | note    |
| ----    | ----   | ----    |
| openid  | string | openid  |
| gender  | string | 性别     |
| nickname| string | 昵称     |
| portrait| string | 头像     |

##### example

```javascript

var openid = "obxM2wvAjoNGtHZkYzBI_I4blpl8";
var gender = "女";
var nickname = "vivian";
var portrait = "https://www.baidu.com/img/bd_logo1.png";

rpc.call("profile", "addUserInfo", openid, gender, nickname, portrait)
  .then(function (result) {

  }, function (error) {
        
  });
```
#### response

| name   | type   | note     |
| ----   | ----   | ----     |
| code   | int    | 结果编码  |
| msg    | string | 结果内容  |

| code  | msg      | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功     |
| other | 错误信息  | 失败     |

See 成功返回数据: [example](../data/profile/sucessful.json)

### 刷新用户缓存 refresh

#### !!禁止前端调用！！
#### request

| name    | type   | note    |
| ----    | ----   | ----    |

##### example

```javascript

rpc.call("profile", "refresh")
  .then(function (result) {

  }, function (error) {
        
  });
```
#### response

| name   | type   | note     |
| ----   | ----   | ----     |
| code   | int    | 结果编码  |
| msg    | string | 结果内容  |

| code  | msg      | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功     |
| other | 错误信息  | 失败     |

See 成功返回数据：[example](../data/profile/sucessful.json)

### 获取所有用户信息 getAllUsers

#### request

| name    | type   | note    |
| ----    | ----   | ----    |
| start   | int    | 起始记录 |
| limit   | int    | 记录条数 |

##### example

```javascript

var start = 1;
var limit = 20;
rpc.call("profile", "getAllUsers", start, limit)
  .then(function (result) {

  }, function (error) {
        
  });
```
#### response

| name   | type   | note     |
| ----   | ----   | ----     |
| code   | int    | 结果编码  |
| msg    | string | 结果内容  |

| code  | msg      | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功     |
| other | 错误信息  | 失败     |

See 成功返回数据：[example](../data/profile/getAllUsers.json)