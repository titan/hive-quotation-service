# Hive 模块

## 数据结构

### hive

|name|type|note|
|----|----|----|
|name|string|蜂巢名称|
|pid|uuid|计划|
|users|[uuid]|参与用户|
|founder|uuid|创始人|

### hive-status

|name|type|note|
|----|----|----|
|percentage-of-period|integer|剩余互助期百分比|
|percentage-of-balance|integer|互助金余额百分比|

### hive-info

|name|type|note|
|----|----|----|
|apportion-ratio|float|分摊比例(每日更新)|
|population|integer|人口数量|
|private-balance|float|个人余额(从缓存中读取)|
|public-balance|float|互助基金(从缓存中读取)|

### hive-event

|name|type|note|
|----|----|----|
|no|string|事件编号|
|type|integer|事件类型|
|description|string|事件描述|
|occurred-at|iso8601|事件发生时间|
|private-apportion-ratio|float|小蜂巢分摊比例|
|private-fee|float|小蜂巢互助基金|
|public-apportion-ratio|float|大蜂巢分摊比例|
|public-fee|float|大蜂巢互助基金|

## 接口

### 获得小蜂巢(健康)状态 getSmallHiveStatus

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|

##### example

```javascript

var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("hive", "getSmallHiveStatus", uid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|status|hive-status|Hive Status|

See [example](../data/hive/getSmallHiveStatus.json)

### 获得大蜂巢(健康)状态 getBigHiveStatus

#### request

|name|type|note|
|----|----|----|
||||

##### example

```javascript
rpc.call("hive", "getBigHiveStatus")
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|status|hive-status|Hive Status|

See [example](../data/hive/getBigHiveStatus.json)

### 获得蜂巢信息 getHiveInfo

包括大蜂巢和小蜂巢的信息。

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("hive", "getHiveInfo", uid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|small|hive-info|Small Hive Info|
|big|hive-info|Big Hive Info|

大小蜂巢中的个人余额其实是一样的。

See [example](../data/hive/getHiveInfo.json)

### 获得资金变动记录 getTransactionHistory

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";
rpc.call("hive", "getTransactionHistory", uid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|events|[hive-events]||

See [example](../data/hive/getTransactionHistory.json)
