document.addEventListener('DOMContentLoaded', () => {
    // 1. Logic for Category Asset Table (category.html)
    const tbody = document.getElementById('categoryTableBody');
    if (tbody) {
        fetch('/api/assets')
          .then(response => response.json())
          .then(data => {
            tbody.innerHTML = '';
            if (data.length > 0) {
              const heading = document.getElementById('categoryHeading');
              if (heading) {
                heading.textContent = `${data[0].CategoryName || 'Asset'} Inventory`;
              }
              data.forEach(asset => {
                const row = document.createElement('tr');
                const formattedDate = asset.PurchaseDate 
                    ? new Date(asset.PurchaseDate).toISOString().split('T')[0] 
                    : 'N/A';

                row.innerHTML = `
                  <td>${asset.AssetID}</td>
                  <td>${formattedDate}</td>
                  <td>${asset.Manufacturer || 'N/A'}</td>
                  <td>${asset.SrNumber || 'N/A'}</td>
                  <td>${asset.EmployeeName || 'Unassigned'}</td>
                `;
                tbody.appendChild(row);
              });
            } else {
              tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No asset records found</td></tr>';
            }
          })
          .catch(error => {
            console.error('Error loading assets:', error);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Failed to load data from server</td></tr>';
          });
    }

    // 2. Logic for Home Page Grid (public/index.html)
    const gridContainer = document.getElementById('gridContainer');
    if (gridContainer) {
        fetch('/api/categories-summary')
          .then(response => response.json())
          .then(data => {
            gridContainer.innerHTML = ''; // Clear hardcoded boxes

            // Dynamically generate category boxes based on database records
            data.forEach(cat => {
                const gridBox = document.createElement('a');
                gridBox.href = `category.html?categoryId=${cat.CategoryID}`;
                gridBox.className = 'grid-box';
                gridBox.innerHTML = `
                    <div>
                        <h3>${cat.CategoryName}</h3>
                        <p>Total assets: ${cat.TotalAssets}</p>
                    </div>
                `;
                gridContainer.appendChild(gridBox);
            });

            // Re-append the static "Add New Asset" card
            const addBox = document.createElement('a');
            addBox.href = 'category.html';
            addBox.className = 'grid-box';
            addBox.innerHTML = `
                <div>
                    <img src="/public/assets/icons/plus.svg" alt="Add Asset" width="50">
                    <p>Add New Asset</p>
                </div>
            `;
            gridContainer.appendChild(addBox);
          })
          .catch(error => {
            console.error('Error loading category summaries:', error);
          });
    }
});