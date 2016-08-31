# Vehicle  模块

## 数据结构

### vehicle-model

|name|type|note|
|----|----|----|
|vehicle_code|string|车型代码|
|vin_code|string|VIN码|
|vehicle_name|string|车型名称|
|brand_name|string|品牌名称|
|family_name|string|车系名称|
|body_type|string|车身结构|
|engine_number|string|车身结构|
|engine_desc|string|发动机描述|
|gearbox_name|string|变速箱类型|
|year_pattern|string|车款|
|group_name|string|车组名称|
|cfg_level|string|配置级别|
|purchase_price|real|新车购置价|
|purchase_price_tax|real|新车购置价含税|
|seat|integer|座位|
|effluent_standard|string|排放标准|
|pl|string|排量|
|fuel_jet_type|string|燃油类型|
|driven_type|string|驱动形式|

### vehicle

|name|type|note|
|----|----|----|
|id|uuid|车ID|
|user_id|user|用户|
|owner|person|车主|
|drivers|[person]|驾驶人|
|vehicle_code|string|车型代码|
|license_no|string|车牌|
|engine_no|string|发动机号|
|register_date|iso8601|车辆注册日期|
|average_mileage|string|年平均行驶里程|
|is_transfer|boolean|是否过户车|
|receipt_no|string|新车购置发票号|
|receipt_date|iso8601|发票开票日期|
|last_insurance_company|string|最近一次投保的保险公司|
|insurance_due_date|date|保险到期时间|
|driving_frontal_view|string|行驶证正面照|
|driving_rear_view|string|行驶证背面照|

### person

|name|type|note|
|----|----|----|
|id|uuid|personID|
|name|string|姓名|
|identity_no|string|身份证|
|phone|string|手机号|
|identity_frontal_view|string|身份证正面照|
|identity_rear_view|string|身份证背面照|
|license_frontal_view|string|驾照正面照|
|license_rear_view|string|驾照背面照|



## 接口

### 获得车型 getVehicleModelsByMake

|name|type|note|
|----|----|----|
|vehicle_code|string|车型代码|

##### example

```javascript
var id = "I0000000000000000250000000000041";

rpc.call("vehicle", "getVehicleModelsByMake", id)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|vehicle-model|vehicle-model|Vehicle Model|

See [example](../data/vehicle/getVehicleModelsByMake.json)

### 获取报价提交表单(新车已上牌) setVehicleInfoOnCard

##### example

```javascript
var name = ""; 
var identity_no = ""; 
var phone = ""; 
var user_id = "";
var vehicle_code = ""; 
var license_no = ""; 
var engine_no = ""; 
var register_date = ""; 
var average_mileage = ""; 
var is_transfer = "";
var last_insurance_company = ""; 
var insurance_due_date = "";

rpc.call("vehicle", "setVehicleInfoOnCard", name, identity_no, phone, user_id, vehicle_code, license_no, engine_no, 
  register_date, average_mileage, is_transfer,last_insurance_company, insurance_due_date)
  .then(function (result) {

  }, function (error) {

  });
```

### 获取报价提交表单(新车未上牌) setVehicleInfo

##### example

```javascript
var name = ""; 
var identity_no = ""; 
var phone = ""; 
var user_id = "";
var vehicle_code = ""; 
var license_no = ""; 
var engine_no = ""; 
var average_mileage = ""; 
var is_transfer = "";
var receipt_no = ""; 
var receipt_date = "";
var last_insurance_company = ""; 
var insurance_due_date = "";

rpc.call("vehicle", "setVehicleInfo", name, identity_no, phone, user_id, vehicle_code, license_no, engine_no, 
  register_date, average_mileage, is_transfer,last_insurance_company, insurance_due_date)
  .then(function (result) {

  }, function (error) {

  });
```

### 提交驾驶人信息 setDriverInfo

var vid = ""; 
var name = "";
var identity_no = "";
var phone = "";
var is_primary = "";

rpc.call("vehicle", "setDriverInfo", vid, name,identity_no,phone,is_primary)
  .then(function (result) {

  }, function (error) {

  });
```

### 修改驾驶人信息 changeDriverInfo

var vid = ""; 
var name = "";
var identity_no = "";
var phone = "";

rpc.call("vehicle", "changeDriverInfo", vid, name,identity_no,phone)
  .then(function (result) {

  }, function (error) {

  });
```

### 获取所有车信息 getVehicleInfos

##### example

```javascript

rpc.call("vehicle", "getVehicleInfos")
  .then(function (result) {

  }, function (error) {

  });
```

See [example](../data/vehicle/getVehicleInfos.json)

### 获取某个车信息 getVehicleInfo

##### example

```javascript

let vid = "00000000-0000-0000-0000-000000000000";
rpc.call("vehicle", "getVehicleInfo"， vid)
  .then(function (result) {

  }, function (error) {

  });

```

See [example](../data/vehicle/getVehicleInfos.json)

### 获取驾驶人信息 getDriverPids


```javascript
var vid = "00000000-0000-0000-0000-000000000000";

rpc.call("vehicle", "getDriverPids", vid)
  .then(function (result) {

  }, function (error) {

  });
```

### 上传证件照 uploadDriverImages


```javascript

var vid = "00000000-0000-0000-0000-000000000000";
var driving_frontal_view = "";
var driving_rear_view = "";
var identity_frontal_view = "";
var identity_rear_view = "";
var license_frontal_views = [];
...

rpc.call("vehicle", "getDriverPids", vid, driving_frontal_view, driving_rear_view, identity_frontal_view, identity_rear_view, license_frontal_view1, license_frontal_view2,..)
  .then(function (result) {

  }, function (error) {

  });
```
