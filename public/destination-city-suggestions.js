(() => {
  const fields = document.querySelectorAll('.pv-destination-city');
  if (!fields.length) return;

  const normalize = value => value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  fetch('/data/destination-airports.json')
    .then(response => {
      if (!response.ok) throw new Error('City list unavailable');
      return response.json();
    })
    .then(catalog => {
      fields.forEach(select => {
        const country = select.form.elements.namedItem('destination');

        const updateCities = (savedCity = '') => {
          const iso = catalog.countryCodes[normalize(country.value)];
          const cities = new Set(catalog.airports
            .filter(airport => airport.country === iso && airport.city)
            .map(airport => airport.city));
          if (savedCity) cities.add(savedCity);

          const placeholder = country.value
            ? 'Any city (country-wide search)'
            : 'Choose a destination country first';
          select.replaceChildren(
            new Option(placeholder, ''),
            ...[...cities].sort((a, b) => a.localeCompare(b)).map(city => new Option(city, city))
          );
          select.value = savedCity;
        };

        country.addEventListener('change', () => updateCities());
        // The airport picker listens for input to clear an airport from the previous city.
        updateCities(select.value);
      });
    })
    .catch(() => {
      // Keep the country-wide option and any saved city if the list cannot load.
    });
})();
