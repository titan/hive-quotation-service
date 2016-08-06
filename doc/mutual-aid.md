# Mutual Aid 模块

## 数据结构

### mutual-aid

|name|type|note|
|----|----|----|
|city|string|市|
|district|string|区|
|street|string|街道|
|driver|person|驾驶员|
|phone|string|联系电话|
|vehicle|vehicle|车|
|occurred-at|iso8601|报案时间|
|responsibility|string|本车责任|
|situation|string|出险情形|
|description|string|简述事件经过|
|scene-view|string|现场照片|
|vehicle-damaged-view|string|车辆受损照片|
|vehicle-frontal-view|string|车辆正面照片|
|driver-view|string|驾驶员现场照片|
|driver-license-view|string|驾驶证照片|
|status|integer|互助状态|
|recompense|mutual-aid-recompense|扣费记录|

互助状态转换图:

![互助状态转换图](../img/mutual-aid-status.png)

### mutual-aid-recompense

|name|type|note|
|----|----|----|
|personal-fee|float|个人扣费|
|personal-balance|float|个人余额|
|small-hive-fee|float|小蜂巢扣费|
|small-hive-balance|float|小蜂巢余额|
|big-hive-fee|float|大蜂巢扣费|
|big-hive-balance|float|大蜂巢余额|
|paid-at|date|支付日期|

## 接口

### 申请互助 applyForMutualAid

#### request

|name|type|note|
|----|----|----|
|city|string|市|
|district|string|区|
|street|string|街道|
|driver|uuid|司机 ID|
|phone|string|联系电话|
|vehicle|uuid|车辆 ID|
|occurred-at|iso8601|报案时间|
|responsibility|string|本车责任|
|situation|string|出险情形|
|description|string|简述事件经过|
|scene-view|string|现场照片|
|vehicle-damaged-view|string|车辆受损照片|
|vehicle-frontal-view|string|车辆正面照片|
|driver-view|string|驾驶员现场照片|
|driver-license-view|string|驾驶证照片|

##### example

```javascript
var aid = {
  city: "北京",
  district: "东城区",
  street: "东直门",
  driver: "00000000-0000-0000-0000-000000000000",
  phone: "13723687462",
  vehicle: "00000000-0000-0000-0000-000000000000",
  occurred_at: "2016-08-01T00:00:00.000Z",
  responsibility: "全部责任",
  situation: "追尾",
  description: "后车眼瞎，追尾我了，车屁股都撞凹了",
  scene_view: "http://aliyun.com/0.png",
  vehicle_damaged_view: "http://aliyun.com/1.png",
  vehicle_frontal_view: "http://aliyun.com/2.png",
  driver_view: "http://aliyun.com/3.png",
  driver_license_view: "http://aliyun.com/4.png"
};

rpc.call("mutual-aid", "applyForMutualAid", aid).then(function (result) {

}, function (error) {

});
```

#### response

|name|type|note|
|----|----|----|
|mutual-aid-id|uuid|Mutual Aid ID|
|mutual-aid-no|string|Mutual Aid No|

See [example](../data/mutual-aid/applyForMutualAid.json)

### 互助列表 getMutualAids

#### request

|name|type|note|
|----|----|----|
|uid|uuid|User Id|
|offset|integer|结果在数据集中的起始位置|
|limit|integer|显示结果的长度|

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";

rpc.call("mutual-aid", "getMutualAids", uid, 0, 10)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|mutual-aids|[mutual-aid]|Mutual Aid List|

See [example](../data/mutual-aid/getMutualAids.json)

### 互助详情 getMutualAid

#### request

|name|type|note|
|----|----|----|
|aid|uuid|互助 ID|

```javascript
var aid = "00000000-0000-0000-0000-000000000000";
rpc.call("mutual-aid", "getMutualAid", aid).then(function (result) {

}, function (error) {

});
```

#### response

|name|type|note|
|----|----|----|
|mutual-aid|mutual-aid|Mutual Aid|

See [example](../data/mutual-aid/getMutualAid.json)
