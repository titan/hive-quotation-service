# Group 模块

## 数据结构

### group

| name             | type         | note         |
| ----             | ----         | ----         |
| name             | string       | 互助小组名称 |
| joined-vehicles  | [vehicle]    | 参与车辆     |
| waiting-vehicles | [vehicle]    | 等待生效车辆 |
| applied-vehicles | [vehicle]    | 申请加入车辆 |
| quitted-vehicles | [vehicle]    | 退出车辆     |
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

### group-poll-item

| name    | type    | note       |
| ----    | ----    | ----       |
| user    | profile | 投票的用户 |
| type    | integer | 投票内容   |
| vehicle | vehicle | 申请车辆   |
| state   | integer | 投票项状态 |
| result  | boolean | 是否同意   |

| type | meaning  |
| ---- | ----     |
| 1    | 申请加入 |

| state | meaning |
| ----  | ----    |
| 1     | 开始    |
| 2     | 结束    |

user 是收到申请的互助组成员。

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
| 2    | 等待生效车辆 |
| 3    | 申请加入车辆 |
| 4    | 已退出车辆   |

### group\_poll\_items

| field       | type      | null | default | index   | reference |
| ----        | ----      | ---- | ----    | ----    | ----      |
| id          | uuid      |      |         | primary |           |
| uid         | uuid      |      |         |         | users     |
| vid         | uuid      |      |         |         | vehicles  |
| type        | smallint  |      | 1       |         |           |
| state       | smallint  |      | 1       |         |           |
| result      | boolean   | ✓    |         |         |           |
| created\_at | timestamp |      | now     |         |           |
| updated\_at | timestamp |      | now     |         |           |

## 缓存结构

| key                    | type  | value                  | note             |
| ----                   | ----  | ----                   | ----             |
| group-entities         | hash  | Group ID => Group JSON | 所有互助组实体   |
| global-balance-percent | float |                        | 剩余余额百分比   |
| global-days-percent    | float |                        | 剩余互助期百分比 |

## 接口

### 获得互助组信息 getGroup

#### request

| name | type | note      |
| ---- | ---- | ----      |
| gid  | uuid | 互助组 ID |

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

### 创建互助组 createGroup

#### request

| name | type | note    |
| ---- | ---- | ----    |
| vid  | uuid | 车辆 ID |

```javascript

var vid = "00000000-0000-0000-0000-000000000000";
rpc.call("group", "createGroup"，vid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

See [example](../data/group/createGroup.json)

### 申请加入互助组 joinGroup

#### request

| name | type | note      |
| ---- | ---- | ----      |
| gid  | uuid | 互助组 ID |
| vid  | uuid | 车辆 ID   |

```javascript

var gid = "00000000-0000-0000-0000-000000000000";
var vid = "00000000-0000-0000-0000-000000000000";
rpc.call("group", "joinGroup"，gid, vid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

See [example](../data/group/joinGroup.json)

### 同意加入申请 agree

#### request

| name | type | note        |
| ---- | ---- | ----        |
| wid  | uuid | WorkItem ID |
| uid  | uuid | 用户 ID     |

```javascript

var wid = "00000000-0000-0000-0000-000000000000";
var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("group", "agree"，wid, uid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

See [example](../data/group/agree.json)

### 拒绝加入申请 refuse

#### request

| name | type | note        |
| ---- | ---- | ----        |
| wid  | uuid | WorkItem ID |
| uid  | uuid | 用户 ID     |

```javascript

var wid = "00000000-0000-0000-0000-000000000000";
var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("group", "refuse"，wid, uid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

See [example](../data/group/refuse.json)

