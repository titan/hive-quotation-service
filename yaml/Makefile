QUOTATION_GROUPS_DEPS = plan-additional.yaml plan-item-additional1.yaml plan-item-additional2.yaml plan-item-additional3.yaml plan-item-additional4.yaml plan-item-main1.yaml plan-item-main2.yaml plan-items-additional.yaml plan-items-main.yaml plan-items-third.yaml plan-item-third1.yaml plan-item-third2.yaml plan-main.yaml plan-rule-main1.yaml plan-rule-main2.yaml plan-rule-main3.yaml plan-rule-main4.yaml plan-rules-additional.yaml plan-rules-main.yaml plan-third.yaml quotation-group-additional.yaml quotation-group-main.yaml quotation-groups.yaml quotation-group-third.yaml quotation-item-additional1.yaml quotation-item-additional2.yaml quotation-item-additional3.yaml quotation-item-additional4.yaml quotation-item-main1.yaml quotation-item-main2.yaml quotation-item-price-additional1.yaml quotation-item-price-additional2.yaml quotation-item-price-additional3.yaml quotation-item-price-additional4.yaml quotation-item-price-main1.yaml quotation-item-price-main2.yaml quotation-item-prices-additional1.yaml quotation-item-prices-additional2.yaml quotation-item-prices-additional3.yaml quotation-item-prices-additional4.yaml quotation-item-prices-main1.yaml quotation-item-prices-main2.yaml quotation-item-prices-third1.yaml quotation-item-prices-third2.yaml quotation-item-price-third1.yaml quotation-item-price-third2-1.yaml quotation-item-price-third2-2.yaml quotation-item-price-third2-3.yaml quotation-item-price-third2-4.yaml quotation-item-price-third2-5.yaml quotation-item-quota-additional1.yaml quotation-item-quota-additional3.yaml quotation-item-quota-additional4.yaml quotation-item-quota-main1.yaml quotation-item-quota-main2.yaml quotation-item-quotas-additional1.yaml quotation-item-quotas-additional2.yaml quotation-item-quotas-additional3.yaml quotation-item-quotas-additional4.yaml quotation-item-quotas-main1.yaml quotation-item-quotas-main2.yaml quotation-item-quotas-third1.yaml quotation-item-quotas-third2.yaml quotation-item-quota-third2-1.yaml quotation-item-quota-third2-2.yaml quotation-item-quota-third2-3.yaml quotation-item-quota-third2-4.yaml quotation-item-quota-third2-5.yaml quotation-items-additional.yaml quotation-items-main.yaml quotation-items-third.yaml quotation-item-third1.yaml quotation-item-third2.yaml

QUOTATIONS = ../data/quotation/getQuotations.json
QUOTATIONS_DEPS = $(QUOTATION_DEPS)

QUOTATION = ../data/quotation/getQuotation.json
QUOTATION_DEPS = $(QUOTATION_GROUPS_DEPS) $(VEHICLE_DEPS)

AVAILABLE_PLANS = ../data/plan/getAvailablePlans.json
AVAILABLE_PLANS_DEPS = plan-additional.yaml plan-item-additional1.yaml plan-item-additional2.yaml plan-item-additional3.yaml plan-item-additional4.yaml plan-item-main1.yaml plan-item-main2.yaml plan-items-additional.yaml plan-items-main.yaml plan-items-third.yaml plan-item-third1.yaml plan-item-third2.yaml plan-main.yaml plan-rule-main1.yaml plan-rule-main2.yaml plan-rule-main3.yaml plan-rule-main4.yaml plan-rules-additional.yaml plan-rules-main.yaml plans-available.yaml plan-third.yaml

JOINED_PLANS = ../data/plan/getJoinedPlans.json
JOINED_PLANS_DEPS = plan-additional.yaml plan-item-additional1.yaml plan-item-additional2.yaml plan-item-additional3.yaml plan-item-additional4.yaml plan-item-main1.yaml plan-item-main2.yaml plan-items-additional.yaml plan-items-main.yaml plan-items-third.yaml plan-item-third1.yaml plan-item-third2.yaml plan-main.yaml plan-rule-main1.yaml plan-rule-main2.yaml plan-rule-main3.yaml plan-rule-main4.yaml plan-rules-additional.yaml plan-rules-main.yaml plans-available.yaml plans-joined.yaml plan-third.yaml

PLAN = ../data/plan/getPlan.json
PLAN_DEPS = plan-item-main1.yaml plan-item-main2.yaml plan-items-main.yaml plan-main.yaml plan-rule-main1.yaml plan-rule-main2.yaml plan-rule-main3.yaml plan-rule-main4.yaml plan-rules-main.yaml

VEHICLE = ../data/vehicle/getVehicle.json
VEHICLE_DEPS = drivers.yaml driver.yaml owner.yaml vehicle-model1.yaml vehicle-model2.yaml vehicle-models.yaml vehicle-model.yaml vehicle.yaml

PROFILE = ../data/profile/getProfile.json
PROFILE_DEPS = profile.yaml

GROUP = ../data/group/getGroup.json
GROUP_DEPS = group.yaml $(VEHICLE_DEPS) $(PROFILE_DEPS)

all: $(QUOTATIONS) $(QUOTATION) $(AVAILABLE_PLANS) $(JOINED_PLANS) $(PLAN) $(GROUP) $(PROFILE)

$(QUOTATIONS): $(QUOTATIONS_DEPS)
	yaml2json quotations.yaml | aeson-pretty > $@

$(QUOTATION): $(QUOTATION_DEPS)
	yaml2json quotation.yaml | aeson-pretty > $@

$(AVAILABLE_PLANS): $(AVAILABLE_PLANS_DEPS)
	yaml2json plans-available.yaml | aeson-pretty > $@

$(JOINED_PLANS): $(JOINED_PLANS_DEPS)
	yaml2json plans-joined.yaml | aeson-pretty > $@

$(PLAN): $(PLAN_DEPS)
	yaml2json plan-main.yaml | aeson-pretty > $@

$(GROUP): $(GROUP_DEPS)
	yaml2json group.yaml | aeson-pretty > $@

$(PROFILE): $(PROFILE_DEPS)
	yaml2json profile.yaml | aeson-pretty > $@

clean:
	rm $(QUOTATION)
	rm $(AVAILABLE_PLANS)
	rm $(JOINED_PLANS)
	rm $(PLAN)
	rm $(GROUP)

.phoney: all clean
