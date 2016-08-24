# Vehicle Model 模块

## 数据结构

### vehicles

|name|type|note|
|----|----|----|
|vinCode|string|VIN码|
|vehicleCode|string|车型代码|
|vehicleName|string|车型名称|
|brandName|string|品牌名称|
|familyName|string|车系名称|
|groupName|string|车组名称|
|pl|string|排量|
|engineDesc|string|发动机描述|
|engineModel|string|发动机型号|
|inairform|string|进气形式|
|arrayType|string|气缸排列形式|
|valveNum|string|气门数|
|fuelJetType|string|燃油类型|
|supplyOil|string|供油方式|
|drivenType|string|驱动形式|
|gearboxName|string|变速箱类型|
|gearNum|string|变速器档数|
|bodyType|string|车身结构|
|doorNum|string|门数|
|wheelbase|string|轴距|
|yearPattern|string|车款|
|cfgLevel|string|配置级别|

## 接口

### 获得车型 getVehicleModelsByMake

|name|type|note|
|----|----|----|
|vinCode|string|VIN码|

##### example

```javascript
var vinCode = "";

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
