# Order 模块

## 数据结构

### vehicle

|name|type|note|
|----|----|----|
|license-no|string|车牌|
|model|string||
|vin|string|车辆识别代码|
|engine-no|string|发动机号|
|register-date|iso8601|车辆注册日期|
|average-mileage|string|年平均行驶里程|
|fuel-type|string|燃料类型|
|receipt-no|string|新车购置发票号|
|receipt-date|iso8601|发票开票日期|
|last-insurance-company|string|最近一次投保的保险公司|
|vehicle-license-frontal-view|string|行驶证正面照|
|vehicle-license-rear-view|string|行驶证背面照|

### person

|name|type|note|
|----|----|----|
|name|string|姓名|
|gender|string|性别|
|identity-no|string|身份证|
|phone|string|手机号|
|identity-frontal-view|string|身份证正面照|
|identity-rear-view|string|身份证背面照|

### order

|name|type|note|
|----|----|----|
|id|uuid|Order ID|
|no|string|Order No|
|uid|uuid|用户 ID|
|pid|uuid|计划 ID|
|vehicles|{person => vehicle}|被保车辆|
|drivers|[person]|被保障人|
|service-ratio|float|服务费率|
|price|float|总价|
|actual-price|float|实付|

## 接口

### 下单 placeAnOrder

#### request

|name|type|note|
|----|----|----|
|uid|uuid|用户 ID|
|pid|uuid|计划 ID|
|vehicles|{person => vehicle}|被保车辆|
|drivers|[person]|被保障人|
|service-ratio|float|服务费率|
|price|float|总价|
|actual-price|float|实付|

##### example

```javascript
var uid = "00000000-0000-0000-0000-000000000000";
var pid = "00000000-0000-0000-0000-000000000000";
var vehicle = {
  license_no: "京A00000";
  model: "江南奥拓";
  vin: "0";
  engine_no: "0";
  register_date: "2016-08-01T00:00:00.000Z";
  average_mileage: "1万公里";
  fuel_type: "汽油";
  receipt_no: "0";
  receipt_date: "2016-08-01T00:00:00.000Z";
  last_insurance_company: "平安保险";
  vehicle_license_frontal_view: "http://aliyun.com/xxx.png";
  vehicle_license_rear_view: "http://aliyun.com/yyy.png";
};
var owner = {
  name: "王宝强";
  gender: "男";
  identity_no: "xxxxxxxxxxxxxxxxxxxxxxxxx";
  phone: "13723687462";
  identity_frontal_view: "http://aliyun.com/xxx.png";
  identity_rear_view: "http://aliyun.com/yyy.png";
};
var driver = {
  name: "王宝强";
  gender: "男";
  identity_no: "xxxxxxxxxxxxxxxxxxxxxxxxx";
  phone: "13723687462";
  identity_frontal_view: "http://aliyun.com/xxx.png";
  identity_rear_view: "http://aliyun.com/yyy.png";
};
var service_ratio = 0.2;
var price = 5000;
var actual_price = 4000;

rpc.call("order", "placeAnOrder", uid, pid, {owner: vehicle}, [driver], service_ratio, price, actual_price)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|order-id|uuid|Order ID|
|order-no|string|Order No|

See [example](../data/order/placeAnOrder.json)

### 获取订单详情 getDetail

#### request

|name|type|note|
|----|----|----|
|order-id|uuid|Order ID|

##### example

```javascript
var order_id = "00000000-0000-0000-0000-000000000000";
rpc.call("order", "getDetail", order_id)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|order|order|Order 详情|

See [example](../data/order/getDetail.json)
