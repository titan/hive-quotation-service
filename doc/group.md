# Hive 模块

## 数据结构

### hive

|name|type|note|
|----|----|----|
|name|string|蜂巢名称|
|users|[uuid]|参与用户|
|founder|uuid|创始人|
|establishment_time|date|创建时间|
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
|personal-balance|float|个人余额(从缓存中读取)|
|public-balance|float|互助基金(从缓存中读取)|

### hive-event

|name|type|note|
|----|----|----|
|no|string|事件编号|
|type|integer|事件类型|
|description|string|事件描述|
|occurred-at|iso8601|事件发生时间|
|small-hive-apportion-ratio|float|小蜂巢分摊比例|
|small-hive-fee|float|小蜂巢互助基金|
|big-hive-apportion-ratio|float|大蜂巢分摊比例|
|big-hive-fee|float|大蜂巢互助基金|

## 接口

### 获得蜂巢基本信息 getHives

#### request

|name|type|note|
|----|----|----|
|hid|uuid|蜂巢ID|

##### example

```javascript

var hid = "00000000-0000-0000-0000-000000000000";
rpc.call( "getSmallHiveStatus", hid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|hive|hive|hive|

See [example](../data/hive/getSmallHiveStatus.json)

### 获得蜂巢状态 getHiveStatus

#### request

|name|type|note|
|----|----|----|
|hid|uuid|蜂巢ID|

##### example

```javascript


var hid = "00000000-0000-0000-0000-000000000000";
rpc.call( "getHiveStatus"，hid)
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

#### request

|name|type|note|
|----|----|----|
|hid|hid|蜂巢 ID|

##### example

```javascript
var hid = "00000000-0000-0000-0000-000000000000";
rpc.call( "getHiveInfo", hid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|info|hive-info|HiveInfo|



See [example](../data/hive/getHiveInfo.json)






### 获得蜂巢事件 getHiveEvent

#### request

|name|type|note|
|----|----|----|
|hid|uuid|蜂巢 ID|

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";
rpc.call( "getHiveEvent", hid)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|events|[hive-event]||

See [example](../data/hive/getTransactionHistory.json)
