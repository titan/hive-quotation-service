# Group 模块

## 数据结构

### group

| name             | type         | note         |
| ----             | ----         | ----         |
| name             | string       | 互助小组名称 |
| joined-vehicles  | [vehicle]    | 参与车辆     |
| waiting-vehicles | [vehicle]    | 等待生效车辆 |
| applied-vehicles | [vehicle]    | 申请加入车辆 |
| founder          | profile      | 创始人       |
| items            | [group-item] | 互助小组条目 |
| created-at       | date         | 创建时间     |

### group-item

| name         | type    | note             |
| ----         | ----    | ----             |
| vehicle      | vehicle | 参与车辆         |
| balance      | float   | 个人余额         |
| init-balance | float   | 个人初始余额     |
| days         | integer | 剩余互助期(天数) |

1. 个人余额来自 Wallet 的 Account。

2. 个人初始总额来自 Order 模块。

3. 剩余互助期来自 Order 模块。

`剩余互助期百分比 = 剩余互助期 / 365 * 100 %`
`互助金余额百分比 = 个人余额 / 个人初始余额 * 100 %`

## 数据库结构

### groups

| field       | type      | null | default | index   | reference |
| ----        | ----      | ---- | ----    | ----    | ----      |
| id          | uuid      |      |         | primary |           |
| name        | char(128) |      |         |         |           |
| founder     | uuid      |      |         |         | users     |
| created\_at | timestamp |      | now     |         |           |
| updated\_at | timestamp |      | now     |         |           |

### group\_vehicles

| field       | type      | null | default | index   | reference |
| ----        | ----      | ---- | ----    | ----    | ----      |
| id          | serial    |      |         | primary |           |
| gid         | uuid      |      |         |         | groups    |
| vid         | uuid      |      |         |         | vehicles  |
| type        | smallint  |      |         |         |           |
| created\_at | timestamp |      | now     |         |           |
| updated\_at | timestamp |      | now     |         |           |

| type | meaning      |
| ---- | ----         |
| 1    | 已加入车辆   |
| 2    | 申请加入车辆 |
| 3    | 等待生效车辆 |
| 4    | 已退出车辆   |

## 接口

### 获得互助组信息 getGroup

#### request

| name | type | note      |
| ---- | ---- | ----      |
| gid  | uuid | 互助组 ID |

##### example

```javascript

var gid = "00000000-0000-0000-0000-000000000000";
rpc.call("group" ,"getGroup", gid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name  | type  | note  |
| ----  | ----  | ----  |
| group | group | Group |

See [example](../data/group/getGroup.json)

### 按车辆获得互助组条目 getGroupItemByVehicle

#### request

| name | type | note    |
| ---- | ---- | ----    |
| vid  | uuid | 车辆 ID |

##### example

```javascript

var vid = "00000000-0000-0000-0000-000000000000";
rpc.call("group", "getGroupItemByVehicle"，vid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name | type       | note       |
| ---- | ----       | ----       |
| item | group-item | Group Item |

See [example](../data/group/getGroupItemByVehicle.json)

