
  const API_CONFIG = {
    key: 'b3bcd4903fb36bcebd5b26fbce5627fd',
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    oneCallUrl: 'https://api.openweathermap.org/data/3.0/onecall'
  };

  let currentCity = '';
  let lastKnownLat = null;
  let lastKnownLon = null;
  let savedCities = JSON.parse(localStorage.getItem('savedCities') || '[]');

  async function init() {
    loadSavedCities();

    try {
      const defaultWeather = await fetchWeatherData('London');
      displayWeatherData('london', defaultWeather);
    } catch (error) {
      console.log('Could not load default city weather');
    }

    document.getElementById('cityInput').addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        searchWeather();
      }
    });
  }

  async function searchWeather() {
    const city = document.getElementById('cityInput').value.trim();
    if (!city) return;

    showLoading();

    try {
      const weatherData = await fetchWeatherData(city);
      displayWeatherData(city, weatherData);
      hideError();
    } catch (error) {
      showError(`Weather data not found for "${city}". Please check the spelling and try again.`);
      console.error('Weather fetch error:', error);
    } finally {
      hideLoading();
    }
  }

  function getCurrentLocation() {
    if (!navigator.geolocation) {
      showError('Geolocation is not supported by this browser.');
      return;
    }

    showLoading();

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          lastKnownLat = latitude;
          lastKnownLon = longitude;

          const weatherData = await fetchWeatherByCoordinates(latitude, longitude);
          displayWeatherData('current-location', weatherData);
          hideError();
        } catch (error) {
          showError('Failed to get weather for your location.');
          console.error('Location weather fetch error:', error);
        } finally {
          hideLoading();
        }
      },
      (error) => {
        hideLoading();
        showError('Unable to retrieve your location. Please search for a city instead.');
        console.error('Geolocation error:', error);
      }
    );
  }

  async function fetchWeatherData(city) {
    const currentWeatherUrl = `${API_CONFIG.baseUrl}/weather?q=${city}&appid=${API_CONFIG.key}&units=metric`;
    const forecastUrl = `${API_CONFIG.baseUrl}/forecast?q=${city}&appid=${API_CONFIG.key}&units=metric`;

    const [currentResponse, forecastResponse] = await Promise.all([
      fetch(currentWeatherUrl),
      fetch(forecastUrl)
    ]);

    if (!currentResponse.ok) throw new Error('Weather data not found');

    const currentData = await currentResponse.json();
    const forecastData = await forecastResponse.json();

    return formatWeatherData(currentData, forecastData);
  }

  async function fetchWeatherByCoordinates(lat, lon) {
    const currentWeatherUrl = `${API_CONFIG.baseUrl}/weather?lat=${lat}&lon=${lon}&appid=${API_CONFIG.key}&units=metric`;
    const forecastUrl = `${API_CONFIG.baseUrl}/forecast?lat=${lat}&lon=${lon}&appid=${API_CONFIG.key}&units=metric`;

    const [currentResponse, forecastResponse] = await Promise.all([
      fetch(currentWeatherUrl),
      fetch(forecastUrl)
    ]);

    if (!currentResponse.ok) throw new Error('Weather data not found');

    const currentData = await currentResponse.json();
    const forecastData = await forecastResponse.json();

    return formatWeatherData(currentData, forecastData);
  }

  function formatWeatherData(currentData, forecastData) {
    const iconMap = {
      '01d': '☀️', '01n': '🌙',
      '02d': '🌤️', '02n': '☁️',
      '03d': '☁️', '03n': '☁️',
      '04d': '☁️', '04n': '☁️',
      '09d': '🌧️', '09n': '🌧️',
      '10d': '🌦️', '10n': '🌧️',
      '11d': '⛈️', '11n': '⛈️',
      '13d': '❄️', '13n': '❄️',
      '50d': '🌫️', '50n': '🌫️'
    };

    const hourly = forecastData.list.slice(0, 5).map(item => ({
      time: new Date(item.dt * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      temp: Math.round(item.main.temp),
      icon: iconMap[item.weather[0].icon] || '🌤️'
    }));

    const dailyMap = new Map();
    forecastData.list.forEach(item => {
      const date = new Date(item.dt * 1000).toDateString();
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { temps: [item.main.temp], icon: item.weather[0].icon, desc: item.weather[0].description });
      } else {
        dailyMap.get(date).temps.push(item.main.temp);
      }
    });

    const daily = Array.from(dailyMap.entries()).slice(0, 7).map(([date, data], index) => {
      const dayNames = ['Today', 'Tomorrow'];
      const dayName = index < 2 ? dayNames[index] : new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
      return {
        day: dayName,
        high: Math.round(Math.max(...data.temps)),
        low: Math.round(Math.min(...data.temps)),
        icon: iconMap[data.icon] || '🌤️',
        desc: data.desc
      };
    });

    return {
      location: `${currentData.name}, ${currentData.sys.country}`,
      current: {
        temp: Math.round(currentData.main.temp),
        description: currentData.weather[0].description,
        icon: iconMap[currentData.weather[0].icon] || '🌤️',
        humidity: currentData.main.humidity,
        windSpeed: Math.round(currentData.wind.speed * 3.6),
        pressure: currentData.main.pressure,
        feelsLike: Math.round(currentData.main.feels_like),
        visibility: Math.round(currentData.visibility / 1000),
        uvIndex: 0
      },
      hourly,
      daily
    };
  }

  async function loadSavedCities() {
    const savedCitiesList = document.getElementById('savedCitiesList');

    if (savedCities.length === 0) {
      savedCitiesList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No saved cities</div>';
      return;
    }

    savedCitiesList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Loading saved cities...</div>';

    try {
      const citiesData = await Promise.all(
        savedCities.map(async (cityEntry) => {
          try {
            let data;
            if (cityEntry.type === 'coords') {
              data = await fetchWeatherByCoordinates(cityEntry.lat, cityEntry.lon);
            } else {
              data = await fetchWeatherData(cityEntry.name);
            }

            return {
              html: `
                <div class="city-item" onclick="displayWeatherData('${cityEntry.type === 'coords' ? 'current-location' : cityEntry.name}', ${JSON.stringify(data).replace(/"/g, '&quot;')})">
                  <div>
                    <div style="font-weight: 600;">${data.location.split(',')[0]}</div>
                    <div style="font-size: 0.9rem; color: #666;">${data.current.description}</div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="city-temp">${data.current.temp}°</span>
                    <button class="remove-city" onclick="event.stopPropagation(); removeCity('${cityEntry.type === 'coords' ? 'coords' : cityEntry.name}')">×</button>
                  </div>
                </div>
              `
            };
          } catch (error) {
            console.error(`Failed to load weather for ${cityEntry.name || 'current-location'}:`, error);
            return {
              html: `
                <div class="city-item" style="opacity: 0.6;">
                  <div>
                    <div style="font-weight: 600;">${cityEntry.name || 'Current Location'}</div>
                    <div style="font-size: 0.9rem; color: #999;">Unable to load</div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <button class="remove-city" onclick="removeCity('${cityEntry.type === 'coords' ? 'coords' : cityEntry.name}')">×</button>
                  </div>
                </div>
              `
            };
          }
        })
      );

      savedCitiesList.innerHTML = citiesData.map(city => city.html).join('');
    } catch (error) {
      console.error('Error loading saved cities:', error);
      savedCitiesList.innerHTML = '<div style="text-align: center; color: #e74c3c; padding: 20px;">Error loading saved cities</div>';
    }
  }

  function displayWeatherData(city, data) {
    currentCity = city;

    document.getElementById('locationName').textContent = data.location;
    document.getElementById('weatherIcon').textContent = data.current.icon;
    document.getElementById('currentTemp').textContent = `${data.current.temp}°C`;
    document.getElementById('weatherDesc').textContent = data.current.description;

    document.getElementById('weatherDetails').innerHTML = `
      <div class="detail-item"><div class="detail-value">${data.current.feelsLike}°</div><div class="detail-label">Feels Like</div></div>
      <div class="detail-item"><div class="detail-value">${data.current.humidity}%</div><div class="detail-label">Humidity</div></div>
      <div class="detail-item"><div class="detail-value">${data.current.windSpeed} km/h</div><div class="detail-label">Wind Speed</div></div>
      <div class="detail-item"><div class="detail-value">${data.current.pressure} hPa</div><div class="detail-label">Pressure</div></div>
      <div class="detail-item"><div class="detail-value">${data.current.visibility} km</div><div class="detail-label">Visibility</div></div>
      <div class="detail-item"><div class="detail-value">${data.current.uvIndex}</div><div class="detail-label">UV Index</div></div>
    `;

    document.getElementById('hourlyForecast').innerHTML = data.hourly
      .map(hour => `<div class="hourly-item"><span>${hour.time}</span><span>${hour.icon}</span><span>${hour.temp}°</span></div>`)
      .join('');

    document.getElementById('forecastGrid').innerHTML = data.daily
      .map(day => `
        <div class="forecast-item">
          <div class="forecast-day">${day.day}</div>
          <div class="forecast-icon">${day.icon}</div>
          <div style="font-size: 0.9rem; color: #666; margin: 5px 0;">${day.desc}</div>
          <div class="forecast-temps">
            <span class="temp-high">${day.high}°</span>
            <span class="temp-low">${day.low}°</span>
          </div>
        </div>
      `)
      .join('');

    updateTheme(data.current.icon);
    document.getElementById('weatherContent').style.display = 'block';
    document.getElementById('cityInput').value = '';
  }

  function updateTheme(icon) {
    const body = document.body;
    if (['🌧️', '⛈️', '☁️'].includes(icon)) {
      body.classList.add('night');
    } else {
      body.classList.remove('night');
    }
  }

  function saveCurrentCity() {
    if (!currentCity) return;

    if (currentCity === 'current-location' && lastKnownLat && lastKnownLon) {
      // Save coordinates
      savedCities.push({ type: 'coords', lat: lastKnownLat, lon: lastKnownLon });
    } else if (currentCity !== 'current-location' && !savedCities.some(c => c.name === currentCity)) {
      savedCities.push({ type: 'city', name: currentCity });
    }

    localStorage.setItem('savedCities', JSON.stringify(savedCities));
    loadSavedCities();

    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ Saved!';
    btn.style.background = '#00b894';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 2000);
  }

  function removeCity(identifier) {
    savedCities = savedCities.filter(c =>
      c.type === 'coords' ? identifier !== 'coords' : c.name !== identifier
    );
    localStorage.setItem('savedCities', JSON.stringify(savedCities));
    loadSavedCities();
  }

  function showLoading() {
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('weatherContent').style.display = 'none';
  }

  function hideLoading() {
    document.getElementById('loadingIndicator').style.display = 'none';
  }

  function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }

  function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
  }

  init();
