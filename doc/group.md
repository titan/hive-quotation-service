# Group 模块

## 修改记录

1. 2016-09-22
  * 给 agree 接口加上缺失的参数。
  * 给 refuse 接口加上缺失的参数。

1. 2016-09-21
  * 去掉 agree 接口中多余的参数。
  * 去掉 refuse 接口中多余的参数。
  * 给表结构加上 deleted 字段。

1. 2016-09-20
  * 为每一个接口增加权限表。
  * 为每一个接口增加详细错误信息。
  * 增加了 group 触发器。

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
| deleted     | boolean   |      | false   |         |           |

### group\_vehicles

| field       | type      | null | default | index   | reference |
| ----        | ----      | ---- | ----    | ----    | ----      |
| id          | serial    |      |         | primary |           |
| gid         | uuid      |      |         |         | groups    |
| vid         | uuid      |      |         |         | vehicles  |
| type        | smallint  |      |         |         |           |
| created\_at | timestamp |      | now     |         |           |
| updated\_at | timestamp |      | now     |         |           |
| deleted     | boolean   |      | false   |         |           |

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
| deleted     | boolean   |      | false   |         |           |

## 缓存结构

| key                    | type  | value                  | note             |
| ----                   | ----  | ----                   | ----             |
| group-entities         | hash  | Group ID => Group JSON | 所有互助组实体   |
| global-balance-percent | float |                        | 剩余余额百分比   |
| global-days-percent    | float |                        | 剩余互助期百分比 |

## 接口

### 获得互助组信息 getGroup

根据 gid 获得互助组的详细内容。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

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

成功：

| name  | type  | note  |
| ----  | ----  | ----  |
| code  | int   | 200   |
| group | group | Group |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning     |
| ---- | ----         |
| 404  | 互助组不存在 |
| 500  | 未知错误     |

See [example](../data/group/getGroup.json)

### 创建互助组 createGroup

为新用户创建互助组。用户自动成为组长。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name | type   | note                     |
| ---- | ----   | ----                     |
| name | string | 互助组名称               |
| vid  | uuid   | 车辆 ID                  |
| uid  | uuid   | 用户 ID(仅 admin 域需要) |

```javascript

var vid = "00000000-0000-0000-0000-000000000000";
var name = "XXX 的互助组";
rpc.call("group", "createGroup"，name, vid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type | note      |
| ---- | ---- | ----      |
| code | int  | 200       |
| gid  | uuid | 互助组 ID |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning             |
| ---- | ----                 |
| 404  | 车辆已属于其它互助组 |
| 408  | 请求超时             |
| 500  | 未知错误             |

See [example](../data/group/createGroup.json)

### 申请加入互助组 joinGroup

用户申请加入互助组。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

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

成功：

| name | type   | note    |
| ---- | ----   | ----    |
| code | int    | 200     |
| msg  | string | Success |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning          |
| ---- | ----              |
| 404  | 互助组/车辆不存在 |
| 408  | 请求超时          |
| 500  | 未知错误          |

See [example](../data/group/joinGroup.json)

### 同意加入申请 agree

用户同意其他用户加入互助组申请。

| domain | accessable |
| ----   | ----       |
| admin  |            |
| mobile | ✓          |

#### request

| name | type | note        |
| ---- | ---- | ----        |
| piid | uuid | PollItem ID |
| gid  | uuid | Group ID    |
| vid  | uuid | Vehicle ID  |

提供 gid 和 vid 参数可以减轻后端系统的开发工作量。

```javascript

let gid = "00000000-0000-0000-0000-000000000000";
let vid = "00000000-0000-0000-0000-000000000000";
let piid = "00000000-0000-0000-0000-000000000000";
rpc.call("group", "agree", piid, gid, vid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type   | note    |
| ---- | ----   | ----    |
| code | int    | 200     |
| msg  | string | Success |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning          |
| ---- | ----              |
| 408  | 请求超时          |
| 500  | 未知错误          |

See [example](../data/group/agree.json)

### 拒绝加入申请 refuse

用户拒绝其他用户加入互助组申请。

| domain | accessable |
| ----   | ----       |
| admin  |            |
| mobile | ✓          |

#### request

| name | type | note        |
| ---- | ---- | ----        |
| piid | uuid | PollItem ID |
| gid  | uuid | Group ID    |
| vid  | uuid | Vehicle ID  |

提供 gid 和 vid 参数可以减轻后端系统的开发工作量。

```javascript

let piid = "00000000-0000-0000-0000-000000000000";
let gid = "00000000-0000-0000-0000-000000000000";
let vid = "00000000-0000-0000-0000-000000000000";
rpc.call("group", "refuse"，piid, gid, vid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

成功：

| name | type   | note    |
| ---- | ----   | ----    |
| code | int    | 200     |
| msg  | string | Success |

失败：

| name | type   | note |
| ---- | ----   | ---- |
| code | int    |      |
| msg  | string |      |

| code | meanning          |
| ---- | ----              |
| 408  | 请求超时          |
| 500  | 未知错误          |

See [example](../data/group/refuse.json)

## 触发器

### group

在创建和修改 group 后会触发该触发器。

| name  | type  | note           |
| ----  | ----  | ----           |
| gid   | uuid  | group id       |
| group | group | group 实体对象 |

See [example](../data/group/group-trigger.json)
