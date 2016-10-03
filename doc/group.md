<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [ChangeLog](#changelog)
- [Data Structure](#data-structure)
  - [group](#group)
  - [group-item](#group-item)
  - [group-poll-item](#group-poll-item)
- [Database](#database)
  - [groups](#groups)
  - [group\_vehicles](#group%5C_vehicles)
  - [group\_poll\_items](#group%5C_poll%5C_items)
- [Cache](#cache)
- [API](#api)
  - [获得互助组信息 getGroup](#%E8%8E%B7%E5%BE%97%E4%BA%92%E5%8A%A9%E7%BB%84%E4%BF%A1%E6%81%AF-getgroup)
    - [request](#request)
    - [response](#response)
  - [获得当前用户的互助组 getGroupOfCurrentUser](#%E8%8E%B7%E5%BE%97%E5%BD%93%E5%89%8D%E7%94%A8%E6%88%B7%E7%9A%84%E4%BA%92%E5%8A%A9%E7%BB%84-getgroupofcurrentuser)
    - [request](#request-1)
    - [response](#response-1)
  - [创建互助组 createGroup](#%E5%88%9B%E5%BB%BA%E4%BA%92%E5%8A%A9%E7%BB%84-creategroup)
    - [request](#request-2)
    - [response](#response-2)
  - [申请加入互助组 joinGroup](#%E7%94%B3%E8%AF%B7%E5%8A%A0%E5%85%A5%E4%BA%92%E5%8A%A9%E7%BB%84-joingroup)
    - [request](#request-3)
    - [response](#response-3)
  - [同意加入申请 agree](#%E5%90%8C%E6%84%8F%E5%8A%A0%E5%85%A5%E7%94%B3%E8%AF%B7-agree)
    - [request](#request-4)
    - [response](#response-4)
  - [拒绝加入申请 refuse](#%E6%8B%92%E7%BB%9D%E5%8A%A0%E5%85%A5%E7%94%B3%E8%AF%B7-refuse)
    - [request](#request-5)
    - [response](#response-5)
- [Trigger](#trigger)
  - [group](#group-1)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## ChangeLog

1. 2016-10-02
  * 增加获取当前用户所在互助组函数。
  * 增加 vid-gid 缓存。

1. 2016-09-24
  * group 加入分摊比例。

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

## Data Structure

### group

| name             | type         | note         |
| ----             | ----         | ----         |
| name             | string       | 互助小组名称 |
| joined-vehicles  | [vehicle]    | 参与车辆     |
| waiting-vehicles | [vehicle]    | 等待生效车辆 |
| applied-vehicles | [vehicle]    | 申请加入车辆 |
| quitted-vehicles | [vehicle]    | 退出车辆     |
| founder          | profile      | 创始人       |
| apportion        | float        | 分摊比例     |
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

## Database

### groups

| field       | type      | null | default | index   | reference |
| ----        | ----      | ---- | ----    | ----    | ----      |
| id          | uuid      |      |         | primary |           |
| name        | char(128) |      |         |         |           |
| founder     | uuid      |      |         |         | users     |
| apportion   | float     |      |         |         |           |
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

## Cache

| key                    | type  | value                  | note             |
| ----                   | ----  | ----                   | ----             |
| group-entities         | hash  | Group ID => Group JSON | 所有互助组实体   |
| vid-gid                | hash  | vid => gid             |                  |
| global-balance-percent | float |                        | 剩余余额百分比   |
| global-days-percent    | float |                        | 剩余互助期百分比 |

## API

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

### 获得当前用户的互助组 getGroupOfCurrentUser

根据 gid 获得互助组的详细内容。

| domain | accessable |
| ----   | ----       |
| admin  |            |
| mobile | ✓          |

#### request

| name | type | note      |
| ---- | ---- | ----      |
|      |      |           |

```javascript

rpc.call("group" ,"getGroupOfCurrentUser")
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

See [example](../data/group/getGroupOfCurrentUser.json)

### 创建互助组 createGroup

为新用户创建互助组。用户自动成为组长。

| domain | accessable |
| ----   | ----       |
| admin  | ✓          |
| mobile | ✓          |

#### request

| name      | type   | note                     |
| ----      | ----   | ----                     |
| name      | string | 互助组名称               |
| vid       | uuid   | 车辆 ID                  |
| apportion | float  | 分摊比例                 |
| uid       | uuid   | 用户 ID(仅 admin 域需要) |

```javascript

let vid = "00000000-0000-0000-0000-000000000000";
let name = "XXX 的互助组";
let apportion = 0.20;

rpc.call("group", "createGroup"，name, vid, apportion)
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

## Trigger

### group

在创建和修改 group 后会触发该触发器。

| name  | type  | note           |
| ----  | ----  | ----           |
| gid   | uuid  | group id       |
| group | group | group 实体对象 |

See [example](../data/group/group-trigger.json)
