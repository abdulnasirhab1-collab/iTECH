/* RemoteSure - static data: world continents/countries, job types */

const WORLD = {
  "Africa": [
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cabo Verde", "Cameroon",
    "Central African Republic", "Chad", "Comoros", "Congo (Republic)", "Côte d'Ivoire", "DR Congo",
    "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia",
    "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi",
    "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda",
    "São Tomé and Príncipe", "Senegal", "Seychelles", "Sierra Leone", "Somalia", "South Africa",
    "South Sudan", "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",
  ],
  "Asia": [
    "Afghanistan", "Armenia", "Azerbaijan", "Bahrain", "Bangladesh", "Bhutan", "Brunei", "Cambodia",
    "China", "Cyprus", "Georgia", "India", "Indonesia", "Iran", "Iraq", "Israel", "Japan", "Jordan",
    "Kazakhstan", "Kuwait", "Kyrgyzstan", "Laos", "Lebanon", "Malaysia", "Maldives", "Mongolia",
    "Myanmar", "Nepal", "North Korea", "Oman", "Pakistan", "Palestine", "Philippines", "Qatar",
    "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Syria", "Taiwan", "Tajikistan", "Thailand",
    "Timor-Leste", "Turkey", "Turkmenistan", "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen",
  ],
  "Europe": [
    "Albania", "Andorra", "Austria", "Belarus", "Belgium", "Bosnia and Herzegovina", "Bulgaria",
    "Croatia", "Czech Republic", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
    "Hungary", "Iceland", "Ireland", "Italy", "Kosovo", "Latvia", "Liechtenstein", "Lithuania",
    "Luxembourg", "Malta", "Moldova", "Monaco", "Montenegro", "Netherlands", "North Macedonia",
    "Norway", "Poland", "Portugal", "Romania", "Russia", "San Marino", "Serbia", "Slovakia", "Slovenia",
    "Spain", "Sweden", "Switzerland", "Ukraine", "United Kingdom", "Vatican City",
  ],
  "North America": [
    "Antigua and Barbuda", "Bahamas", "Barbados", "Belize", "Canada", "Costa Rica", "Cuba", "Dominica",
    "Dominican Republic", "El Salvador", "Grenada", "Guatemala", "Haiti", "Honduras", "Jamaica",
    "Mexico", "Nicaragua", "Panama", "Saint Kitts and Nevis", "Saint Lucia",
    "Saint Vincent and the Grenadines", "Trinidad and Tobago", "United States",
  ],
  "South America": [
    "Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador", "Guyana", "Paraguay", "Peru",
    "Suriname", "Uruguay", "Venezuela",
  ],
  "Oceania": [
    "Australia", "Fiji", "Kiribati", "Marshall Islands", "Micronesia", "Nauru", "New Zealand", "Palau",
    "Papua New Guinea", "Samoa", "Solomon Islands", "Tonga", "Tuvalu", "Vanuatu",
  ],
};

// Extra spellings found in job-board location text
const COUNTRY_ALIASES = {
  "United States": ["usa", "us", "u.s.", "u.s.a.", "america", "united states of america"],
  "United Kingdom": ["uk", "u.k.", "england", "scotland", "wales", "northern ireland", "britain", "great britain"],
  "United Arab Emirates": ["uae", "dubai", "abu dhabi"],
  "South Korea": ["korea"],
  "Czech Republic": ["czechia"],
  "DR Congo": ["democratic republic of the congo", "dr congo", "drc"],
  "Côte d'Ivoire": ["ivory coast", "cote d'ivoire"],
  "Eswatini": ["swaziland"],
  "Myanmar": ["burma"],
  "Turkey": ["türkiye", "turkiye"],
  "Netherlands": ["holland", "the netherlands"],
  "Cabo Verde": ["cape verde"],
  "Timor-Leste": ["east timor"],
  "Russia": ["russian federation"],
  "Vatican City": ["vatican"],
};

// Phrases that mean "open to this whole continent"
const CONTINENT_KEYWORDS = {
  "Africa": ["africa", "emea"],
  "Asia": ["asia", "apac", "asia-pacific", "middle east"],
  "Europe": ["europe", "emea", "european union", "eu"],
  "North America": ["north america", "americas"],
  "South America": ["south america", "latam", "latin america", "americas"],
  "Oceania": ["oceania", "apac", "anz"],
};

const CONTINENTS = Object.keys(WORLD);

const COUNTRIES = Object.entries(WORLD).flatMap(([continent, names]) =>
  names.map((name) => ({ name, continent, aliases: COUNTRY_ALIASES[name] || [] })));

const JOB_TYPES = {
  all: { label: "Any job type", kw: [] },
  software: { label: "Software Development", kw: ["developer", "engineer", "software", "frontend", "front-end", "backend", "back-end", "full stack", "fullstack", "programmer", "mobile", "react", "python", "java", "node"] },
  devops: { label: "DevOps / Sysadmin", kw: ["devops", "sysadmin", "sre", "cloud", "infrastructure", "kubernetes", "aws", "platform engineer"] },
  data: { label: "Data & Analytics", kw: ["data", "analyst", "analytics", "machine learning", "ml ", "ai ", "scientist", "bi "] },
  design: { label: "Design", kw: ["design", "ux", "ui ", "graphic", "illustrator", "figma", "creative"] },
  marketing: { label: "Marketing", kw: ["marketing", "seo", "growth", "social media", "content marketing", "brand", "community"] },
  sales: { label: "Sales", kw: ["sales", "account executive", "business development", "sdr", "bdr", "account manager"] },
  support: { label: "Customer Support", kw: ["support", "customer success", "customer service", "help desk", "customer experience"] },
  product: { label: "Product / Project Mgmt", kw: ["product manager", "product owner", "project manager", "program manager", "scrum"] },
  writing: { label: "Writing & Content", kw: ["writer", "copywriter", "editor", "content", "technical writer", "journalist"] },
  finance: { label: "Finance & Legal", kw: ["finance", "accountant", "accounting", "legal", "lawyer", "bookkeeper", "compliance", "paralegal"] },
  hr: { label: "HR & Recruiting", kw: ["recruiter", "recruiting", "hr ", "human resources", "talent", "people operations"] },
  qa: { label: "QA / Testing", kw: ["qa ", "quality assurance", "tester", "test engineer", "sdet"] },
  admin: { label: "Admin & Virtual Assistant", kw: ["assistant", "administrative", "virtual assistant", "operations", "coordinator", "data entry"] },
};

// Remotive category slugs per job type (narrows the API request)
const REMOTIVE_CATEGORY = {
  software: "software-dev", devops: "devops", data: "data", design: "design",
  marketing: "marketing", sales: "sales", support: "customer-support",
  product: "product", writing: "writing", finance: "finance-legal",
  hr: "human-resources", qa: "qa",
};
