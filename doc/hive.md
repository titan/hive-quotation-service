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
