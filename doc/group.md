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

| name             | type         | note         |
| ----             | ----         | ----         |
|vehicle|vehicle|参与车辆|
|balance|float|个人余额|
|init-balance|float|个人初始余额|
|days|integer|剩余互助期(天数)|

个人余额来自 Wallet 的 Account。
个人初始总额来自 Order 模块。

`剩余互助期百分比 = 剩余互助期 / 365 * 100 %`
`互助金余额百分比 = 个人余额 / 个人初始余额 * 100 %`

### group-status

|name|type|note|
|----|----|----|
|percentage-of-period|integer|剩余互助期百分比|
|percentage-of-balance|integer|互助金余额百分比|

### group-info

|name|type|note|
|----|----|----|
|apportion-ratio|float|分摊比例(每日更新)|
|population|integer|人口数量|
|personal-balance|float|个人余额(从缓存中读取)|
|public-balance|float|互助基金(从缓存中读取)|

### group-event

|name|type|note|
|----|----|----|
|no|string|事件编号|
|type|integer|事件类型|
|description|string|事件描述|
|occurred-at|iso8601|事件发生时间|
|small-group-apportion-ratio|float|小互助组分摊比例|
|small-group-fee|float|小互助组互助基金|
|big-group-apportion-ratio|float|大互助组分摊比例|
|big-group-fee|float|大互助组互助基金|

## 接口

### 获得互助组基本信息 getGroup

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户ID|

##### example

```javascript

var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("group" ,"getGroup", uid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|group|group|Group|

See [example](../data/hive/getSmallHiveStatus.json)

### 获得互助组状态 getGroupStatus

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|

##### example

```javascript


var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("group", "getGroupStatus"，uid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|status|group-status|GroupStatus|

See [example](../data/hive/getBigHiveStatus.json)



### 获得互助组信息 getGroupInfo

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("group", "getGroupInfo", uid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|info|group-info|GroupInfo|

See [example](../data/hive/getHiveInfo.json)



### 获得互助组事件 getGroupEvent

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("group", "getGroupEvent", uid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|events|[group-event]|Group events|

See [example](../data/hive/getTransactionHistory.json)
