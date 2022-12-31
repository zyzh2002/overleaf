const GoogleBigQuery = require('@google-cloud/bigquery').BigQuery

let dataset = null

function getDataset() {
  if (!dataset) {
    console.log(
      'Connecting to BigQuery dataset: ',
      process.env.BQ_PROJECT_ID,
      process.env.BQ_DATASET
    )

    dataset = new GoogleBigQuery({
      projectId: process.env.BQ_PROJECT_ID,
      keyFilename: process.env.GCS_KEY_FILE,
    }).dataset(process.env.BQ_DATASET)
  }

  return dataset
}

async function query(query) {
  const [job] = await getDataset().createQueryJob({ query })
  const [rows] = await job.getQueryResults()
  return rows
}

module.exports = {
  query,
}
