fetch('http://localhost:3000/api/search?q=iPhone%2015%20Pro%20Max')
  .then(res => res.json())
  .then(data => {
    console.log(JSON.stringify(data.data.results.find(r => r.out_of_stock_shops?.length > 0) || data.data.results[0], null, 2));
  })
  .catch(err => console.error(err));