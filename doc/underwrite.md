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
| qid                    | uuid      | ✓    |         |         | quotaions |
| opid                   | uuid      | ✓    |         |         | operators |
| plan\_time             | timestamp |      |         |         |           |
| real\_time             | timestamp | ✓    |         |         |           |
| validate\_place        | char(256) |      |         |         |           |
| validate\_update\_time | timestamp |      |         |         |           |
| real\_place            | char(256) | ✓    |         |         |           |
| real\_update\_time     | timestamp | ✓    |         |         |           |
| certificate\_state     | int       | ✓    |         |         |           |
| note                   | text      | ✓    |         |         |           |
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

| name                   | type      | note                     |
| ----                   | ----      | ----                     |
| oid                    | uuid      | 订单id                   |
| plan\_time             | timestamp | 计划核保时间             |
| validate\_place        | string    | 预约验车地点             |
| validate\_update\_time | timestamp | 预约验车地点最后修改时间 |

##### example

```javascript

rpc.call("underwrite", "createUnderwrite")
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

