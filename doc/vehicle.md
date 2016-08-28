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
|owner|person|车主ID|
|owner|[person]|车主ID|
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

### 获取报价提交表单 setVehicleInfoOnCard(新车已上牌)

### 获取报价提交表单 setVehicleInfo(新车未上牌)

### 提交驾驶人信息 setDriverInfo

### 修改驾驶人信息 changeDriverInfo

### 获取所有车信息 getVehicleInfos

### 获取所有人信息 getPersonInfos

### 获取某个车信息 getOneVehicleInfo

### 获取某个人信息 getOnePersonInfo



### 获得车型 getVehicleModelsByMake

|name|type|note|
|----|----|----|
|vehicle_code|string|车型代码|

##### example

```javascript
var id = "I0000000000000000250000000000041";

rpc.call("vehicle-model", "getVehicleModelsByMake", make)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|vehicle-model|vehicle-model|Vehicle Model|

See [example](../data/vehicle-model/getVehicleModelsByMake.json)

### 获得车信息 getVehicleInfo

|name|type|note|
|----|----|----|
|id|uuid|车ID|

##### example

```javascript
var id = "00000000-0000-0000-0000-000000000000";

rpc.call("vehicle", "getVehicleInfo",id)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|vehicle|vehicle|Vehicle|

See [example](../data/vehicle-model/getVehicleInfo.json)

### 获得person信息 getPersonInfo

|name|type|note|
|----|----|----|
|id|uuid|perosnID|

##### example

```javascript
var id = "00000000-0000-0000-0000-000000000000";

rpc.call("person", "getPersonInfo",id)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|person|person|Person|

See [example](../data/vehicle-model/getPersonInfo.json)

### 获得驾驶人 getDriverInfos

|name|type|note|
|----|----|----|
|id|uuid|驾驶人ID|

##### example

```javascript
var id = "00000000-0000-0000-0000-000000000000";

rpc.call("drivers", "getDriver",id)
  .then(function (result) {

  }, function (error) {

  });
```

#### response

|name|type|note|
|----|----|----|
|drivers|drivers|Drivers|

See [example](../data/vehicle-model/getDriver.json)
