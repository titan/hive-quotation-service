# Vehicle Model 模块

## 数据结构

### vehicles

|name|type|note|
|----|----|----|
|id|uuid|车型编号|
|vehicle_code|string|车型代码|
|vin_code|string|VIN码|
|vehicle_name|string|车型名称|
|brand_name|string|品牌名称|
|family_name|string|车系名称|
|group_name|string|车组名称|
|pl|string|排量|
|engine_desc|string|发动机描述|
|engine_model|string|发动机型号|
|inairform|string|进气形式|
|array_type|string|气缸排列形式|
|valve_num|string|气门数|
|fuel_jet_type|string|燃油类型|
|supply_oil|string|供油方式|
|driven_type|string|驱动形式|
|gearbox_name|string|变速箱类型|
|gear_num|string|变速器档数|
|body_type|string|车身结构|
|door_num|string|门数|
|wheelbase|string|轴距|
|year_pattern|string|车款|
|cfg_level|string|配置级别|

## 接口

### 获得车型 getVehicleModelsByMake

|name|type|note|
|----|----|----|
|id|uuid|车型编号|

##### example

```javascript
var id = "00000000-0000-0000-0000-000000000000";

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
