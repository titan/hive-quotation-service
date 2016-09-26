# Underwrite 模块

## 数据结构

### underwrite

| name                   | type      | note                     |
| ---------------------  | --------  | --------------           |
| order                  | order     | 订单                     |
| quotation              | quotation | 报价                     |
| operator               | operator  | 验车工作人员             |
| plan\_time             | ISO8601   | 计划核保时间             |
| real\_time             | ISO8601   | 实际核保完成时间         |
| validate\_place        | string    | 预约验车地点             |
| validate\_update\_time | ISO8601   | 预约验车地点最后修改时间 |
| real\_place            | string    | 实际验车地点             |
| real\_update\_time     | ISO8601   | 实际验车地点最后修改时间 |
| certificate\_state     | int       | 用户证件上传情况         |
| problems               | [problem] | 车辆存在问题             |
| note                   | string    | 备注                     |
| note\_update\_time     | ISO8601   | 备注最后修改时间         |
| photos                 | [photo]   | 照片                     |
| underwrite\_result     | string    | 核保结果                 |
| result\_update\_time   | ISO8601   | 核保结果最后修改时间     |

### photo

| name         | type      | note         |
| ----         | ----      | ----         |
| photo        | string    | 照片         |

### problem

| name        | type   | note             |
| ----        | ----   | ----             |
| type        | string | 车辆存在问题类型 |
| description | string | 车辆存在问题描述 |

## 数据库结构

### underwrite

| field                  | type      | null | default | index   | reference |
| ----                   | ----      | ---- | ----    | ----    | ----      |
| id                     | uuid      |      |         | primary |           |
| oid                    | uuid      |      |         |         | orders    |
| opid                   | uuid      | ✓    |         |         | operators |
| plan\_time             | timestamp |      |         |         |           |
| real\_time             | timestamp | ✓    |         |         |           |
| validate\_place        | char(256) |      |         |         |           |
| validate\_update\_time | timestamp |      |         |         |           |
| real\_place            | char(256) | ✓    |         |         |           |
| real\_update\_time     | timestamp | ✓    |         |         |           |
| certificate\_state     | int       | ✓    |         |         |           |
| note                   | text      | ✓    |         |         |           |
| note\_update\_time     | timestamp | ✓    |         |         |           |
| underwrite\_result     | char(10)  | ✓    |         |         |           |
| result\_update\_time   | timestamp | ✓    |         |         |           |
| created\_at            | timestamp |      | now     |         |           |
| updated\_at            | timestamp |      | now     |         |           |
| deleted                | boolean   |      | false   |         |           |

| certificate\_state | meaning      |
| ----               | ----         |
| 0                  | 未上传证件   |
| 1                  | 上传部分证件 |
| 2                  | 证件全部上传 |

### photos

| field                  | type       | null | default | index   | reference  |
| ----                   | ----       | ---- | ----    | ----    | ----       |
| id                     | uuid       |      |         | primary |            |
| uwid                   | uuid       |      |         |         | underwrite |
| photo                  | char(1024) |      |         |         |            |
| created\_at            | timestamp  |      | now     |         |            |
| updated\_at            | timestamp  |      | now     |         |            |
| deleted                | boolean    |      | false   |         |            |

### problems

| field       | type      | null | default | index   | reference  |
| ----        | ----      | ---- | ----    | ----    | ----       |
| id          | uuid      |      |         | primary |            |
| uwid        | uuid      |      |         |         | underwrite |
| type        | char(32)  |      |         |         |            |
| description | text      |      |         |         |            |
| created\_at | timestamp |      | now     |         |            |
| updated\_at | timestamp |      | now     |         |            |
| deleted     | boolean   |      | false   |         |            |

## 缓存结构

### underwrite

| key           | type       | value                  | note     |
| ----          | ----       | ----                   | ----     |
| underwrite-id | sorted set | (核保更新时间, 核保ID) | 核保汇总 |

### underwrite-entities

| key            | type | value               | note         |
| ----           | ---- | ----                | ----         |
| underwrite-entities | hash | 核保ID => 核保 JSON | 所有核保实体 |


## 接口

### 生成核保 createUnderwrite

#### request

| name                 | type      | note                     |
| ----                 | ----      | ----                     |
| oid                  | uuid      | 订单id                   |
| plan_time            | timestamp | 计划核保时间             |
| validate_place       | string    | 预约验车地点             |
| validate_update_time | timestamp | 预约验车地点最后修改时间 |

##### example

```javascript

rpc.call("underwrite", "createUnderwrite", oid, plan_time, validate_place, validate_update_time)
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
| 200   | null     | 成功    |
| other | 错误信息 | 失败    |

See 成功返回数据：[example](../data/underwrite/createUnderwrite.json)


### 工作人员填充验车信息 fillUnderwrite

#### request

| name              | type      | note             |
| ----              | ----      | ----             |
| real_place        | string    | 实际验车地点     |
| operator          | operator  | 验车工作人员     |
| certificate_state | int       | 用户证件上传情况 |
| problems          | [problem] | 车辆存在问题     |
| photos            | [photo]   | 照片             |


##### example

```javascript

var real_place = "北京市东城区东直门东方银座";
var operator = "张三";
var certificate_state = 1;
var problems = [
  {
    "type" : "剐蹭",
    "description" :"追尾。。。。"
  },
  {
    "type" : "剐蹭",
    "description" :"追尾。。。。"
  }
]


rpc.call("underwrite", "fillUnderwrite", real_place, operator, certificate_state, problems, photos)
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

See 成功返回数据：[example](../data/underwrite/fillUnderwrite.json)

### 提交审核结果 submitUnderwriteResult

#### request

| name               | type    | note                 |
| ----               | ----    | ----                 |
| underwrite_result  | string  | 核保结果             |
| result_update_time | ISO8601 | 核保结果最后修改时间 |

##### example

```javascript

var underwrite_result = "未通过";
var result_update_time = "9999-12-31 23:59:59"

rpc.call("underwrite", "submitUnderwriteResult", underwrite_result, result_update_time)
  .then(function (result) {

  }, function (error) {
        
  });
```

#### response

| name  | type     | note     |
| ----  | ----     | ----     |
| code  | int      | 结果编码 |
| msg   | string   | 结果内容 |

| code  | msg      | meaning  |
| ----  | ----     | ----     |
| 200   | null     | 成功     |
| other | 错误信息 | 失败     |

See 成功返回数据：[example](../data/underwrite/sucessful.json)

### 修改预约验车地点  alterValidatePlace

#### request

| name                 | type    | note                     |
| ----                 | ----    | ----                     |
| validate_place       | string  | 预约验车地点             |
| validate_update_time | ISO8601 | 预约验车地点最后修改时间 |

##### example

```javascript

var validate_place = "北京市东城区东直门东方银座";
var validate_update_time = "9999-12-31 23:59:59"

rpc.call("underwrite", "alterValidatePlace", validate_place, validate_update_time)
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

See 成功返回数据：[example](../data/underwrite/sucessful.json)

### 修改审核结果  alterUnderwriteResult

#### request

| name               | type    | note                 |
| ----               | ----    | ----                 |
| underwrite_result  | string  | 核保结果             |
| result_update_time | ISO8601 | 核保结果最后修改时间 |

##### example

```javascript

var underwrite_result = "通过";
var validate_update_time = "9999-12-31 23:59:59"

rpc.call("underwrite", "alterUnderwriteResult", underwrite_result, result_update_time)
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

See 成功返回数据：[example](../data/underwrite/sucessful.json)

### 修改实际验车地点 alterRealPlace

#### request

| name             | type    | note                     |
| ----             | ----    | ----                     |
| real_place       | string  | 实际验车地点             |
| real_update_time | ISO8601 | 实际验车地点最后修改时间 |

##### example

```javascript

var real_place = "通过";
var real_update_time = "9999-12-31 23:59:59"

rpc.call("underwrite", "alterRealPlace", real_place, real_update_time)
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

See 成功返回数据：[example](../data/underwrite/sucessful.json)

### 修改备注 alterNote

#### request

| name             | type    | note             |
| ----             | ----    | ----             |
| note             | string  | 备注             |
| note_update_time | ISO8601 | 备注最后修改时间 |

##### example

```javascript

var note = "备注内容";
var note_update_time = "9999-12-31 23:59:59"

rpc.call("underwrite", "alterNote", note, note_update_time)
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

See 成功返回数据：[example](../data/underwrite/sucessful.json)

### 上传现场图片 uploadPhotos

#### request

| name  | type   | note     |
| ----  | ----   | ----     |
| uwid  | uuid   | 核保id   |
| photo | string | 图片地址 |

##### example

```javascript

var uwid = "0000000000-0000-0000-0000-000000000000";
var photo = "http://www.baidu.com";

rpc.call("underwrite", "uploadPhotos", uwid, photo)
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

See 成功返回数据：[example](../data/underwrite/sucessful.json)

### 根据订单号得到核保信息 getUnderwriteByOrder

#### request

| name | type   | note     |
| ---- | ----   | ----     |
| oid  | string | 订单编号 |

##### example

```javascript

var oid = "";

rpc.call("underwrite", "getUnderwriteByOrder", oid)
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

See 成功返回数据：[example](../data/underwrite/getUnderwriteByOrder.json)

