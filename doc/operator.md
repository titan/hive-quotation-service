# Operator 模块

## 数据结构

### operator

| name      | type   | note     |
| ----      | ----   | ----     |
| oname     | string | 操作员   |
| passsword | string | 密码     |
| name      | string | 真实姓名 |
| gender    | string | 性别     |
| phone     | string | 手机号   |
| email     | string | 邮箱     |
| portrait  | string | 头像     |

## 数据库结构

### operators

| field       | type       | null | default | index   | reference |
| ----        | ----       | ---- | ----    | ----    | ----      |
| id          | uuid       |      |         | primary |           |
| oname       | char(64)   |      |         |         |           |
| passsword   | char(32)   |      |         |         |           |
| name        | char(64)   |      |         |         |           |
| gender      | char(4)    | ✓    |         |         |           |
| phone       | char(16)   |      |         |         |           |
| portrait    | char(1024) | ✓    |         |         |           |
| created\_at | timestamp  |      | now     |         |           |
| updated\_at | timestamp  |      | now     |         |           |
| deleted     | boolean    |      | false   |         |           |

## 缓存结构

### operator

| key         | type | value      | note       |
| ----        | ---- | ----       | ----       |
| operator-id | set  | (操作员ID) | 操作员汇总 |

### operator-entities

| key               | type | value                   | note           |
| ----              | ---- | ----                    | ----           |
| operator-entities | hash | 操作员ID => 操作员 JSON | 所有操作员实体 |

## 接口

### 获得某个操作员信息 getOperatorInfo

#### request

| name    | type   | note    |
| ----    | ----   | ----    |
|operator\_id|uuid|操作员id|

##### example

```javascript

var opid = "0000000000-0000-0000-0000-000000000000";
rpc.call("operator", "getOperatorInfo", opid)
  .then(function (result) {

  }, function (error) {
        
  });
```

#### response

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 结果编码 |
| msg  | string | 结果内容 |

| code  | msg      | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功    |
| other | 错误信息 | 失败    |

See 成功返回数据：[example](../data/operator/getOperatorInfo.json)


### 获得所有操作员信息 getOperatorInfos

#### request

| name    | type   | note    |
| ----    | ----   | ----    |

##### example

```javascript

rpc.call("operator", "getOperatorInfos")
  .then(function (result) {

  }, function (error) {
        
  });
```

#### response

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 结果编码 |
| msg  | string | 结果内容 |

| code  | msg      | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功    |
| other | 错误信息 | 失败    |

See 成功返回数据：[example](../data/operator/getOperatorInfos.json)


### 添加操作员 addOperatorInfo

#### request

| name      | type   | note     |
| ----      | ----   | ----     |
| oname     | string | 操作员   |
| passsword | string | 密码     |
| name      | string | 真实姓名 |
| gender    | string | 性别     |
| phone     | string | 手机号   |
| email     | string | 邮箱     |
| portrait  | string | 头像     |

##### example

```javascript

var oname = "";
var password = "";
var name = "";
var gender = "";
var phone = "";
var email = "";
var portrait = "";

rpc.call("operator", "addOperatorInfo", oname, password, name, gender, phone, email, portrait)
  .then(function (result) {

  }, function (error) {
        
  });
```
#### response

| name | type   | note     |
| ---- | ----   | ----     |
| code | int    | 结果编码 |
| msg  | string | 结果内容 |

| code  | msg      | meaning |
| ----  | ----     | ----    |
| 200   | null     | 成功    |
| other | 错误信息 | 失败    |

See 成功返回数据: [example](../data/profile/sucessful.json)


