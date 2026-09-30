---
name: statistical-interpretation
description: Heuristics for translating raw JSON statistical output into standard academic prose.
---

# Statistical Interpretation Guide

Use this skill to choose, validate, and explain statistical methods. Perform computation in a saved Python script using NumPy, SciPy, statsmodels, scikit-learn, pandas, or Polars. Use JavaScript only for an existing workflow that is already implemented there. Dependency details belong to runtime instructions, not this interpretation procedure.

## General Guidelines
- Do not just dump raw arrays or JSON objects of coefficients to the user.
- State the estimand or research question, unit of analysis, sample size, missing-data treatment, and assumptions checked.
- Validate input counts and ranges and independently check key output identities before interpreting them.
- Always state the model type used (e.g., Ordinary Least Squares Regression, Independent Samples t-test, Logistic Regression).
- Report results in a standard format, heavily leaning on APA style for reporting statistics.

## Interpreting Specific Metrics
### P-values, Significance, and Confidence Intervals
- Clearly state the alpha level (typically `p < .05`, `p < .01`, or `p < .001`).
- If `p` is less than the threshold, describe the relationship as "statistically significant".
- If `p` is greater, state that the results are "not statistically significant" or there is "insufficient evidence" to reject the null hypothesis. Do NOT claim the variables have "no relationship".
- Whenever possible, report 95% Confidence Intervals (CIs) alongside p-values to provide context on the estimate's precision.
- Do not treat a threshold crossing as the importance of a finding; discuss magnitude, precision, design, multiplicity, and practical relevance.

### R-squared (Model Fit) and Effect Sizes
- Explain R-squared in plain language: "The model explains X% of the variance in the dependent variable."
- Contextualize the fit based on typical scientific standards (where lower R-squared values like 0.10 - 0.30 are often expected due to human variability).
- For t-tests or ANOVAs, always attempt to calculate and report an effect size (e.g., Cohen's d or Eta-squared).
- Avoid universal labels for effect-size magnitude. Interpret against the domain, measurement scale, and study design.

### Coefficients and Standard Errors
- For linear regression: "A one-unit increase in [Variable X] is associated with a [Coefficient] unit [increase/decrease] in [Variable Y], holding other variables constant."
- Always mention the direction (positive/negative), magnitude, and standard error (SE).
- Use causal wording only when identification and design justify it; otherwise say "associated with."

## Example Output
> "An ordinary least squares regression was conducted to predict [Y] based on [X]. The overall model was statistically significant (R² = .15, p < .01), indicating that the model explains 15% of the variance in [Y]. The coefficient for [X] was positive and significant (b = 2.34, SE = 0.45, p < .05, 95% CI [1.45, 3.23]), suggesting that for every one-unit increase in [X], [Y] increases by 2.34 units on average, controlling for other factors."
