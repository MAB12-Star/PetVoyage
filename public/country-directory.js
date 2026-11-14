(() => {
  const form = document.querySelector('#countryForm');
  if (!form) return;
  const country = form.querySelector('#countrySelect');
  const pet = form.querySelector('#countryPet');
  const cards = new Map([...document.querySelectorAll('#countryResults [data-country]')].map(card => [card.dataset.country,card]));
  const updatePets = () => {
    const card = cards.get(country.value);
    const links = card ? [...card.querySelectorAll('a')] : [];
    pet.replaceChildren(new Option('Choose a pet',''), ...links.map(link => new Option(link.textContent,link.getAttribute('href'))));
    pet.disabled = links.length === 0;
  };
  country.addEventListener('change',updatePets);
  form.addEventListener('submit',event => {event.preventDefault(); if (pet.value) location.assign(pet.value);});
  updatePets();
})();
