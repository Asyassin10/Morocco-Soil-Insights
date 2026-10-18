# Crop comparison without AI — proposed next feature

## User flow

After confirming one or two fields, choose a crop in the map's selected-land tray. Show each land's available readings alongside the published crop requirements. Explain each comparison using short fixed sentences. Keep the map, current layer and 3D comparison available.

This is a reference comparison, not a planting recommendation, yield forecast or probability of success. No language model, embeddings, vector database or new paid API is required.

## Evidence and initial scope

- Use reviewed, versioned crop records based on [FAO EcoCrop](https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/). FAO says updates ceased around 2015, so present it as a general reference, not current local trial evidence.
- Start with common wheat, [Triticum aestivum, record 2114](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2114). Its published pH reference is 6–7 optimal and 5.5–8.5 absolute. These are species-level ecological ranges, not cultivar-specific guarantees or measured success probabilities.
- Additional crops need their own reviewed records before they appear in the selector. Conflicting references must be identified, not silently averaged; the previously reviewed EcoCrop and International Olive Council olive pH ranges differ.
- Limit the first implementation to soil factors. Mark climate and water-supply suitability as unevaluated, without adding weather services.

## Result cards

For each available factor, show the land reading, the cited reference range and one status:

- Within the published optimal range.
- Within the broader published range.
- Outside the published range.
- Missing information / needs verification.

These statuses describe a reference check, not overall crop suitability. Do not convert them into a combined percentage, winner, fertility grade or guarantee. The same criteria must apply to both lands. Higher readings are not automatically better.

## Data rules

Store crop identity, scientific name, source URL, reference revision/date, units, optimal/absolute ranges, scope and known measurement-method limitations with every requirement. Preserve the reading's actual source, depth, prediction status and missing-value state.

Only produce definitive comparisons for compatible definitions. If the crop reference does not specify a measurement method or depth, explain the check's provisional scope instead of presenting a laboratory diagnosis. Unknown values are never zero.

Do not treat bedrock depth as measured rootable soil depth, infer drainage from texture alone, or substitute total nitrogen for plant-available nitrogen. Soil organic carbon is not the same quantity as organic matter. Unknown salinity and drainage remain unknown unless appropriate evidence is added.

## Implementation and verification

Use a small, reviewed local crop-reference catalogue and a pure deterministic comparison function. Keep crop selection in Redux so the same choice drives A/B, map and 3D context. Existing measured/predicted soil results remain the input; no provider retrieval starts merely from choosing a crop.

Verify boundary values, missing and non-finite readings, mismatched units/methods, optimal versus absolute ranges, equivalent criteria across A/B, crop switching and mobile layout. Include the source in Help and a short reference note in the crop panel.

Review dataset-specific reuse terms before distributing copied records. PyAEZ can be considered later if broader modelling and its required input data are available; it is unnecessary for the initial reference-check interface.

Status: proposal only. Crop comparison is not implemented by the hydration/Help fix.
