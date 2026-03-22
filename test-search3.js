fetch('http://localhost:3000/api/search?q=iPhone%2015%20Pro%20Max')
  .then(res => res.json())
  .then(data => {
    const oos = data.data.results.filter(r => r.out_of_stock_shops && r.out_of_stock_shops.length > 0);
    console.log(JSON.stringify(oos, null, 2));
  })
  .catch(err => console.error(err));