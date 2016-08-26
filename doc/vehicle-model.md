# Vehicle Model 模块

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

## 接口

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
