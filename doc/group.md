# Group 模块

## 数据结构

### group

|name|type|note|
|----|----|----|
|name|string|蜂巢名称|
|users|[uuid]|参与用户|
|founder|uuid|创始人|
|establishment_time|date|创建时间|
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
|small-group-apportion-ratio|float|小蜂巢分摊比例|
|small-group-fee|float|小蜂巢互助基金|
|big-group-apportion-ratio|float|大蜂巢分摊比例|
|big-group-fee|float|大蜂巢互助基金|

## 接口

### 获得蜂巢基本信息 getGroup

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

### 获得蜂巢状态 getGroupStatus

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



### 获得蜂巢信息 getGroupInfo

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



### 获得蜂巢事件 getGroupEvent

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
|events|[group-event]|Groupevents|

See [example](../data/hive/getTransactionHistory.json)
