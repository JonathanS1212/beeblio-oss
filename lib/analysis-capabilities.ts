/**
 * The analysis-capability catalog: what the agent's Linux sandbox can
 * actually run, grouped for display. Shared by the /analysis marketing page
 * and by teasers elsewhere (pricing cards, landing sections) so every
 * surface tells the same story.
 *
 * The engineering source of truth is docs/sandbox-analysis-capabilities.md;
 * keep this catalog in sync when the pinned sandbox stack changes
 * (agent/sandbox/image/python-analysis-requirements.txt).
 */

/** Groups order the catalog into page sections. */
export type AnalysisGroupId = "statistics" | "machine-learning" | "data" | "figures" | "documents";

/**
 * Icon ids let this lib stay pure data (no React imports); the page maps
 * each id to a lucide-react component.
 */
export type AnalysisIconId =
  | "sigma"
  | "test-tubes"
  | "trending-up"
  | "activity"
  | "heart-pulse"
  | "brain"
  | "boxes"
  | "type"
  | "database"
  | "layers"
  | "filter"
  | "chart-column"
  | "network"
  | "scan-text"
  | "notebook-pen"
  | "image";

export type AnalysisCapability = { name: string; desc: string };

export type AnalysisDomain = {
  id: string;
  group: AnalysisGroupId;
  title: string;
  blurb: string;
  icon: AnalysisIconId;
  capabilities: readonly AnalysisCapability[];
};

export type AnalysisDomainGroup = {
  id: AnalysisGroupId;
  title: string;
  blurb: string;
};

export const analysisDomainGroups: readonly AnalysisDomainGroup[] = [
  {
    id: "statistics",
    title: "Statistics & Inference",
    blurb: "From first descriptives to models with defensible uncertainty.",
  },
  {
    id: "machine-learning",
    title: "Machine Learning",
    blurb: "Classical, tabular, CPU-scale, the kind of ML research questions actually need.",
  },
  {
    id: "data",
    title: "Data Engineering",
    blurb: "Get data in shape and at scale: SQL over files, streaming frames, and every stats-package format.",
  },
  {
    id: "figures",
    title: "Visualization & Networks",
    blurb: "Publication graphics and graph analysis, saved as first-class workspace artifacts.",
  },
  {
    id: "documents",
    title: "Documents & Media",
    blurb: "PDFs, scanned pages, notebooks, and media — read, extract, and produce.",
  },
];

export const analysisDomains: readonly AnalysisDomain[] = [
  {
    id: "descriptive",
    group: "statistics",
    title: "Descriptive Statistics",
    blurb: "Know your data before modeling it.",
    icon: "sigma",
    capabilities: [
      { name: "Summary Statistics", desc: "Means, medians, spread, quartiles — missing values accounted" },
      { name: "Frequency Tables", desc: "Level counts and percentages, reconciled and sorted" },
      { name: "Dataset Profiling", desc: "Row/column census with types, missing, distinct, samples" },
      { name: "Cross-Tabulation", desc: "Contingency tables for categorical relationships" },
      { name: "Distribution Shape", desc: "Skewness, kurtosis, and quantile checks" },
    ],
  },
  {
    id: "hypothesis-testing",
    group: "statistics",
    title: "Hypothesis Testing",
    blurb: "Parametric, non-parametric, and everything the assumptions require.",
    icon: "test-tubes",
    capabilities: [
      { name: "t-tests & ANOVA", desc: "Group comparisons with post-hoc follow-ups" },
      { name: "Non-Parametric Tests", desc: "Mann-Whitney, Wilcoxon, Kruskal-Wallis, χ², Kolmogorov-Smirnov" },
      { name: "Correlation with CIs", desc: "Pearson, Spearman, and Kendall with significance" },
      { name: "Effect Sizes & Intervals", desc: "Estimates with confidence, not just p-values" },
      { name: "Power Analysis", desc: "Sample sizing and minimum detectable effects" },
      { name: "Multiple-Testing Control", desc: "Bonferroni, Holm, and FDR corrections" },
    ],
  },
  {
    id: "regression",
    group: "statistics",
    title: "Regression & Generalized Models",
    blurb: "Models with full inference — coefficients, intervals, and diagnostics.",
    icon: "trending-up",
    capabilities: [
      { name: "Linear Models", desc: "OLS/WLS/GLS with R², F-tests, residual diagnostics" },
      { name: "Generalized Linear Models", desc: "Logistic, Poisson, and negative binomial" },
      { name: "Robust Standard Errors", desc: "HC estimators and cluster-robust inference" },
      { name: "Mixed-Effects Models", desc: "Random intercepts and slopes for multilevel data" },
      { name: "GEE", desc: "Correlated and longitudinal designs" },
      { name: "Nonlinear Curve Fitting", desc: "Custom models fit with confidence bands" },
    ],
  },
  {
    id: "time-series",
    group: "statistics",
    title: "Time Series & Forecasting",
    blurb: "Trends, seasonality, and forecasts from your own series.",
    icon: "activity",
    capabilities: [
      { name: "ARIMA & SARIMAX", desc: "Seasonal models with exogenous regressors" },
      { name: "Exponential Smoothing", desc: "ETS state-space forecasting" },
      { name: "Decomposition", desc: "Trend, seasonal, and remainder separation" },
      { name: "Vector Autoregression", desc: "Multi-series dynamics and impulse response" },
      { name: "Signal Processing", desc: "Filters, spectra, and peak detection" },
    ],
  },
  {
    id: "survival",
    group: "statistics",
    title: "Survival & Duration Analysis",
    blurb: "Time-to-event modeling that respects censoring.",
    icon: "heart-pulse",
    capabilities: [
      { name: "Kaplan-Meier", desc: "Survival curves with confidence bands" },
      { name: "Cox Proportional Hazards", desc: "Semiparametric regression with diagnostics" },
      { name: "Parametric Survival", desc: "Accelerated failure-time families" },
    ],
  },
  {
    id: "predictive",
    group: "machine-learning",
    title: "Predictive Modeling",
    blurb: "Train, validate, and persist — the full supervised workflow.",
    icon: "brain",
    capabilities: [
      { name: "Classification & Regression", desc: "Logistic, SVM, k-NN, naive Bayes" },
      { name: "Tree Ensembles", desc: "Random forests and gradient boosting" },
      { name: "Neural Baselines", desc: "MLPs for small tabular problems" },
      { name: "Cross-Validation", desc: "K-fold, stratified, and grouped splits" },
      { name: "Hyperparameter Search", desc: "Grid and randomized tuning" },
      { name: "Evaluation & Calibration", desc: "ROC/AUC, PR curves, confusion matrices" },
      { name: "Model Persistence", desc: "Fitted models saved to your workspace" },
    ],
  },
  {
    id: "unsupervised",
    group: "machine-learning",
    title: "Unsupervised Learning",
    blurb: "Find structure when nobody handed you labels.",
    icon: "boxes",
    capabilities: [
      { name: "Clustering", desc: "k-means, DBSCAN, and agglomerative" },
      { name: "Gaussian Mixtures", desc: "EM-fitted soft clustering" },
      { name: "Dimensionality Reduction", desc: "PCA, t-SNE, and MDS" },
      { name: "Anomaly Detection", desc: "Isolation forests and density methods" },
      { name: "Cluster Diagnostics", desc: "Silhouette scores and stability checks" },
    ],
  },
  {
    id: "text-mining",
    group: "machine-learning",
    title: "Text Mining",
    blurb: "Corpus statistics without leaving the stack.",
    icon: "type",
    capabilities: [
      { name: "TF-IDF Vectorization", desc: "n-grams and vocabulary control" },
      { name: "Topic Modeling", desc: "NMF and LDA over document collections" },
      { name: "Text Classification", desc: "Supervised labels on corpus features" },
      { name: "Similarity & Clustering", desc: "Document distance and grouping" },
    ],
  },
  {
    id: "sql",
    group: "data",
    title: "SQL Analytics",
    blurb: "Full SQL over your files — no database server to stand up.",
    icon: "database",
    capabilities: [
      { name: "Query Files Directly", desc: "CSV, JSON, and Parquet by path" },
      { name: "Relational Analytics", desc: "Joins, window functions, and pivots" },
      { name: "Beyond-RAM Aggregation", desc: "Spills to disk instead of dying" },
    ],
  },
  {
    id: "large-data",
    group: "data",
    title: "Large-Data Processing",
    blurb: "Datasets bigger than memory, handled by design.",
    icon: "layers",
    capabilities: [
      { name: "Streaming DataFrames", desc: "Lazy, out-of-core execution plans" },
      { name: "Parquet & Arrow", desc: "Columnar interchange between engines" },
      { name: "Chunked Workflows", desc: "Jobs shaped to the compute envelope" },
    ],
  },
  {
    id: "cleaning",
    group: "data",
    title: "Cleaning & Recoding",
    blurb: "Every derivation reproducible, raw data untouched.",
    icon: "filter",
    capabilities: [
      { name: "Coercion & Missing Data", desc: "Tolerant parsing and sentinel handling" },
      { name: "Reshape & Derive", desc: "Merges, melts, and recodes written as new files" },
      { name: "Stats-Package Formats", desc: "SPSS, SAS, Stata, plus Excel and ODS" },
      { name: "Spreadsheet Round-Trip", desc: "Formatted Excel output for collaborators" },
    ],
  },
  {
    id: "visualization",
    group: "figures",
    title: "Publication Graphics",
    blurb: "Every chart a saved script, every figure a durable artifact.",
    icon: "chart-column",
    capabilities: [
      { name: "Chart Scripts", desc: "PNG, SVG, and PDF exports" },
      { name: "Statistical Plots", desc: "Box, violin, regression, heatmaps, facets" },
      { name: "Consistent Styling", desc: "House style kept across a whole report" },
      { name: "Report-Ready Tables", desc: "Formatted tables for documents and exports" },
    ],
  },
  {
    id: "networks",
    group: "figures",
    title: "Network & Graph Analysis",
    blurb: "The engine behind literature mapping and any relational data.",
    icon: "network",
    capabilities: [
      { name: "Centrality & Structure", desc: "Degree, betweenness, closeness, PageRank" },
      { name: "Community Detection", desc: "Modularity-based grouping" },
      { name: "Science Mapping", desc: "Co-citation, co-authorship, bibliographic coupling" },
    ],
  },
  {
    id: "pdf-ocr",
    group: "documents",
    title: "PDF Extraction & OCR",
    blurb: "From scanned pages to analysis-ready tables.",
    icon: "scan-text",
    capabilities: [
      { name: "Text & Table Extraction", desc: "Layout-aware parsing of digital PDFs" },
      { name: "OCR", desc: "Tesseract on scanned documents and figures" },
      { name: "Page Rendering", desc: "Page images for figures and inspection" },
      { name: "Assemble & Split", desc: "Merge, split, and metadata edits" },
    ],
  },
  {
    id: "notebooks",
    group: "documents",
    title: "Reproducible Notebooks",
    blurb: "The deliverable can be the method.",
    icon: "notebook-pen",
    capabilities: [
      { name: "Notebook Authoring", desc: ".ipynb built programmatically" },
      { name: "Headless Execution", desc: "Execute and re-run notebooks headlessly in isolated analysis jobs" },
      { name: "Saved Beside Outputs", desc: "Notebook, data, and figures in one workspace" },
    ],
  },
  {
    id: "media",
    group: "documents",
    title: "Image & Media Processing",
    blurb: "Everyday media work without leaving the workspace.",
    icon: "image",
    capabilities: [
      { name: "Image Processing", desc: "Resize, convert, and compose" },
      { name: "Audio & Video", desc: "Conversion, inspection, and frame extraction" },
    ],
  },
];

/** One row per environment fact rendered on the "how runs happen" strip. */
export type AnalysisEnvIconId = "cpu" | "package" | "ruler" | "lock" | "file-lock" | "files";

export type AnalysisEnvironmentFact = {
  icon: AnalysisEnvIconId;
  label: string;
  value: string;
  note: string;
};

export const analysisEnvironmentFacts: readonly AnalysisEnvironmentFact[] = [
  {
    icon: "cpu",
    label: "Real Cloud Computer",
    value: "A private microVM per user",
    note: "Full Python, Node, and shell, not a snippet runner",
  },
  {
    icon: "package",
    label: "Research Environment",
    value: "Read-only, reproducible",
    note: "Every project runs the same vetted scientific stack; nothing installs at runtime",
  },
  {
    icon: "ruler",
    label: "Compute Envelope",
    value: "Sufficient RAM",
    note: "Sized for interactive research turns; heavy jobs chunk or stream",
  },
  {
    icon: "lock",
    label: "No Network Inside",
    value: "Your data stays in the sandbox",
    note: "Bulk collection runs host-side; analysis works on files by path",
  },
  {
    icon: "file-lock",
    label: "Provenance by Default",
    value: "Raw data is immutable",
    note: "Every derivation writes a new, clearly named file — rerunnable anytime",
  },
  {
    icon: "files",
    label: "Saved as Artifacts",
    value: "Scripts, figures, notebooks",
    note: "Each run lands in your project workspace next to the data",
  },
];

/** The pinned package inventory shown as the stack section. */
export type AnalysisStackGroup = {
  id: string;
  label: string;
  packages: readonly { name: string; version?: string }[];
};

export const analysisStack: readonly AnalysisStackGroup[] = [
  {
    id: "dataframes",
    label: "DataFrames & I/O",
    packages: [
      { name: "pandas", version: "2.3.2" },
      { name: "Polars", version: "1.33.1" },
      { name: "PyArrow", version: "21.0.0" },
      { name: "DuckDB", version: "1.3.2" },
      { name: "openpyxl", version: "3.1.5" },
      { name: "odfpy", version: "1.4.1" },
      { name: "pyxlsb", version: "1.0.10" },
      { name: "PyReadStat", version: "1.3.1" },
      { name: "tabulate", version: "0.9.0" },
    ],
  },
  {
    id: "statistics-ml",
    label: "Statistics & ML",
    packages: [
      { name: "NumPy", version: "2.3.3" },
      { name: "SciPy", version: "1.16.2" },
      { name: "statsmodels", version: "0.14.5" },
      { name: "scikit-learn", version: "1.7.2" },
    ],
  },
  {
    id: "visualization-networks",
    label: "Visualization & Networks",
    packages: [
      { name: "Matplotlib", version: "3.10.6" },
      { name: "Seaborn", version: "0.13.2" },
      { name: "NetworkX", version: "3.5" },
    ],
  },
  {
    id: "documents",
    label: "PDF & Documents",
    packages: [
      { name: "PyMuPDF", version: "1.26.4" },
      { name: "pdfplumber", version: "0.11.7" },
      { name: "pypdf", version: "6.0.0" },
      { name: "python-docx", version: "1.2.0" },
      { name: "python-pptx", version: "1.0.2" },
      { name: "XlsxWriter", version: "3.2.9" },
      { name: "markitdown", version: "0.1.7" },
    ],
  },
  {
    id: "notebooks",
    label: "Notebooks",
    packages: [
      { name: "nbformat", version: "5.10.4" },
      { name: "nbclient", version: "0.10.2" },
      { name: "ipykernel", version: "6.30.1" },
    ],
  },
  {
    id: "images",
    label: "Images",
    packages: [{ name: "Pillow", version: "11.3.0" }],
  },
  {
    id: "system",
    label: "System Tools",
    packages: [
      { name: "FFmpeg" },
      { name: "Poppler" },
      { name: "Tesseract OCR" },
      { name: "Graphviz" },
      { name: "ripgrep" },
      { name: "jq" },
      { name: "git" },
      { name: "Node.js 24" },
    ],
  },
];

/**
 * Deliberate limits, stated openly: each pairs an out-of-scope topic with
 * the in-scope substitute (if any). Rendered as the honesty section.
 */
export type AnalysisBoundary = { topic: string; why: string; instead?: string };

export const analysisBoundaries: readonly AnalysisBoundary[] = [
  {
    topic: "Deep Learning & GPU Training",
    why: "The sandbox is CPU-only; PyTorch and TensorFlow are not part of the pinned stack",
    instead: "Classical ML covers tabular prediction, with small MLP baselines included",
  },
  {
    topic: "XGBoost / LightGBM",
    why: "Not pinned in the environment",
    instead: "scikit-learn's HistGradientBoosting — same family, in the box",
  },
  {
    topic: "R, Stata, SPSS, SAS Software",
    why: "The software isn't installed — only their file formats are readable",
    instead: "Datasets load natively from .sav, .dta, and .sas7bdat, and the workflow translates to Python",
  },
  {
    topic: "Hours-long Training Jobs",
    why: "Runs are bounded (~2 min, 2 GB) to keep research turns interactive",
    instead: "Stream with DuckDB or Polars, chunk across runs, or simplify the model",
  },
  {
    topic: "Installing Packages at Runtime",
    why: "Deliberately disabled so every run is reproducible",
    instead: "The stack is curated and version-pinned; request an addition and it ships to every sandbox",
  },
  {
    topic: "Network Access from Analysis Code",
    why: "Analysis runs network-isolated, without your credentials",
    instead: "The assistant fetches data host-side (literature, World Bank, web), then analyzes by path",
  },
];

/** Counts for hero stats and teasers elsewhere. */
export const analysisDomainCount = analysisDomains.length;
export const analysisCapabilityCount = analysisDomains.reduce((total, domain) => total + domain.capabilities.length, 0);
export const analysisPackageCount = analysisStack.reduce((total, group) => total + group.packages.length, 0);
