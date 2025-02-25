async function populateCategoryFilter() {
    try {
      const response = await fetch('/get_categories');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const categories = await response.json();
  
      const categoryFilter = document.getElementById('categoryFilter');
  
      while (categoryFilter.options.length > 1) {
        categoryFilter.remove(1);
      }
  
      categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category; 
        option.textContent = category; 
        categoryFilter.appendChild(option);
      });
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }
  
  document.addEventListener('DOMContentLoaded', populateCategoryFilter);
  
  async function populateCategoryPostSubmit() {
    try {
      const response = await fetch('/get_categories');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const categories = await response.json();
      // console.log(categories);
      
      const categoryPostSubmit = document.getElementsByClassName('category-checkboxes')[0];
      categoryPostSubmit.innerHTML = '';  
  
      categories.forEach((category) => {
        const option = document.createElement('input');
        option.type = 'checkbox';
        option.name = 'category';
        option.value = category;
  
        const label = document.createElement('label');
        label.textContent = category;
        label.appendChild(option);
  
        categoryPostSubmit.appendChild(label);
      });
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }
  document.addEventListener('DOMContentLoaded', populateCategoryPostSubmit);
  