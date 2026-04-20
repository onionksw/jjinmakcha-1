import React, { useState, useCallback, useEffect } from 'react';
import { MapPin, Navigation, Bus, Train, ArrowRight, ChevronLeft, Search, Beer, Car, Clock, Sparkles, User, CreditCard, Home, Settings, Edit2, Bell, ToggleLeft, ToggleRight, Store, Star, X, Utensils, BellRing, Shield, TrendingUp, Phone, Footprints, ChevronRight, FileText, Plus, Coffee, Wine } from 'lucide-react';
import { getTmapTransitRoutes } from './services/tmapService';
import { AppState, HybridRoute, Place } from './types';
import CostChart from './components/CostChart';
import Countdown from './components/Countdown';
import DaumPostcode from 'react-daum-postcode';
import RealTimeArrival from './components/RealTimeArrival';
import TmapRouteView from './components/TmapRouteView';

// Tab Definitions
type Tab = 'SEARCH' | 'OPEN_NOW' | 'HISTORY' | 'MY_PAGE';
type PlaceCategory = 'ALL' | 'PUB' | 'FOOD' | 'CAFE';
type PlaceSort = 'RECOMMEND' | 'DISTANCE' | 'RATING';

// Splash Messages
const SPLASH_MESSAGES = [
    "택시비 아껴서 내일 해장국 먹자! 🍲",
    "막차는 기다려주지 않아... 우리가 알려줄게! 🚌",
    "지갑 지키는 귀가 요정 등판! 🧚‍♀️",
    "집에 가야 내일 또 놀지! 🏠",
    "서울의 밤은 길고, 막차는 짧다 🌙",
    "아직 한 잔 더 할 수 있어? (막차는 타고!) 🍻",
    "편의점 들를 시간... 계산해드립니다 🏪"
];

// Curated list of high-quality nightlife/food images (Updated)
const PLACE_IMAGES = {
  PUB: [
    "https://images.unsplash.com/photo-1574096079513-d8259960295f?q=80&w=800&auto=format&fit=crop", // Neon Nightlife
    "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?q=80&w=800&auto=format&fit=crop", // Pancakes & Beer vibe
    "https://images.unsplash.com/photo-1535921874130-362d250800a7?q=80&w=800&auto=format&fit=crop"  // Green Bottle (Soju style)
  ],
  SOUP: [
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800&auto=format&fit=crop", // Healthy Bowl
    "https://images.unsplash.com/photo-1604579278540-b8754e0a8fd2?q=80&w=800&auto=format&fit=crop", // Spicy Stew
    "https://images.unsplash.com/photo-1626804475297-411dbe655c63?q=80&w=800&auto=format&fit=crop"  // Korean Soup
  ],
  CAFE: [
    "https://images.unsplash.com/photo-1493857671505-72967e2e2760?q=80&w=800&auto=format&fit=crop", // Latte Art
    "https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=800&auto=format&fit=crop", // Cozy Cafe Light
    "https://images.unsplash.com/photo-1511920170033-f8396924c348?q=80&w=800&auto=format&fit=crop"  // Coffee Shop
  ],
  DEFAULT: [
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop", // Restaurant Interior
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?q=80&w=800&auto=format&fit=crop", // Food Spread
    "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=800&auto=format&fit=crop"  // Cocktails
  ]
};

// 5 Fixed Mock Places
const MOCK_PLACES: Place[] = [
    {
        id: 'p1',
        name: '청춘포차 강남본점',
        type: '실내포차',
        rating: '4.8',
        address: '서울 강남구 강남대로 123',
        description: '새벽까지 불타는 청춘들의 성지! 얼큰한 어묵탕에 소주 한잔 어때요?',
        closingTime: '06:00',
        tags: ['#헌팅', '#가성비', '#새벽감성'],
        imageKeyword: 'pocha',
        representativeMenu: '얼큰 어묵탕',
        distance: '120m',
        imageUrl: "https://images.unsplash.com/photo-1623961990059-28356e226a77?q=80&w=800&auto=format&fit=crop" // Custom Oden Image
    },
    {
        id: 'p2',
        name: '24시 전주 콩나물국밥',
        type: '국밥',
        rating: '4.5',
        address: '서울 서초구 서초대로 456',
        description: '쓰린 속 달래주는 뜨끈한 국밥 한 그릇. 해장은 여기서부터 시작입니다.',
        closingTime: '24시간',
        tags: ['#해장', '#혼밥가능', '#24시'],
        imageKeyword: 'soup',
        representativeMenu: '콩나물국밥',
        distance: '350m'
    },
    {
        id: 'p3',
        name: '달빛 이자카야',
        type: '이자카야',
        rating: '4.9',
        address: '서울 강남구 테헤란로 789',
        description: '조용한 분위기에서 즐기는 하이볼과 꼬치구이. 막차 놓쳐도 괜찮아.',
        closingTime: '05:00',
        tags: ['#분위기깡패', '#데이트', '#하이볼'],
        imageKeyword: 'izakaya',
        representativeMenu: '모듬 꼬치 8종',
        distance: '500m'
    },
    {
        id: 'p4',
        name: '카페 미드나잇',
        type: '24시 카페',
        rating: '4.2',
        address: '서울 강남구 도산대로 101',
        description: '첫차 기다리기 딱 좋은 넓고 쾌적한 카페. 콘센트 완비!',
        closingTime: '24시간',
        tags: ['#카공', '#첫차대기', '#넓은좌석'],
        imageKeyword: 'cafe',
        representativeMenu: '아이스 아메리카노',
        distance: '50m'
    },
    {
        id: 'p5',
        name: '역전 할머니 맥주',
        type: '맥주',
        rating: '4.6',
        address: '서울 강남구 논현로 202',
        description: '가슴까지 시원해지는 살얼음 맥주! 간단하게 막잔하고 집에 가자.',
        closingTime: '04:00',
        tags: ['#살얼음맥주', '#가성비', '#2차추천'],
        imageKeyword: 'beer',
        representativeMenu: '치즈 라볶이',
        distance: '200m'
    }
];

const App: React.FC = () => {
  // Splash Screen State
  const [showSplash, setShowSplash] = useState(true);
  const [splashMessage, setSplashMessage] = useState('');

  // Navigation State
  const [activeTab, setActiveTab] = useState<Tab>('SEARCH');
  
  // Search Flow State
  const [appState, setAppState] = useState<AppState>(AppState.HOME);
  const [startLoc, setStartLoc] = useState('');
  const [endLoc, setEndLoc] = useState('');
  const [routes, setRoutes] = useState<HybridRoute[]>([]);
  const [fullTaxiCost, setFullTaxiCost] = useState(0);
  const [selectedRoute, setSelectedRoute] = useState<HybridRoute | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Postcode Modal State
  const [postcodeTarget, setPostcodeTarget] = useState<'start' | 'end' | null>(null);
  
  // Notice Detail State
  const [selectedNotice, setSelectedNotice] = useState<any | null>(null);
  
  // Notification Modal State
  const [isNotiModalOpen, setIsNotiModalOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);

  // Open Now / Places State
  const [nearbyPlaces, setNearbyPlaces] = useState<Place[]>([]);
  const [isPlacesLoading, setIsPlacesLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [placeCategory, setPlaceCategory] = useState<PlaceCategory>('ALL');
  const [placeSort, setPlaceSort] = useState<PlaceSort>('RECOMMEND');
  
  // User Settings State
  const [homeAddress, setHomeAddress] = useState('');
  const [isEditingHome, setIsEditingHome] = useState(false);
  const [tempHomeAddress, setTempHomeAddress] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  
  // Advanced My Page State
  const [nickname, setNickname] = useState('프로 막차러');
  const [tempNickname, setTempNickname] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [emergencyPhone, setEmergencyPhone] = useState('010-xxxx-xxxx');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [tempPhone, setTempPhone] = useState('');
  const [walkPreference, setWalkPreference] = useState<'SHORT' | 'CHEAP'>('CHEAP');

  // Splash Screen Effect
  useEffect(() => {
    // Pick a random message
    setSplashMessage(SPLASH_MESSAGES[Math.floor(Math.random() * SPLASH_MESSAGES.length)]);
    
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500); // Show splash for 2.5 seconds

    return () => clearTimeout(timer);
  }, []);

  // Mock History Data
  const historyData = [
      { id: 1, date: '10.27 (금)', route: '강남역 → 사당역', cost: '12,500원', saved: '8,000원', icon: '🍺', type: 'usage' },
      { id: 2, date: '10.20 (금)', route: '홍대입구 → 일산', cost: '18,000원', saved: '15,000원', icon: '🎤', type: 'usage' },
      { id: 3, date: '어제', title: '막차 시간 변경 알림', desc: 'N26번 버스 배차 간격이 조정되었어요.', type: 'alert', content: '안녕하세요. 찐막차 팀입니다.\n\n최근 서울시 심야버스(N버스) 운행 정책 변경으로 인해 N26번 버스의 배차 간격이 기존 30분에서 25분으로 단축되었습니다.\n\n더욱 빠르고 쾌적한 귀가를 위해 찐막차 앱 경로 탐색에도 해당 변경사항이 즉각 반영되었습니다.\n\n앞으로도 더 나은 서비스를 제공하기 위해 노력하겠습니다. 감사합니다.' },
      { id: 4, date: '10.15 (일)', title: '찐막차 v1.2 업데이트 안내', desc: '새로운 기능들이 추가되었어요!', type: 'alert', content: '안녕하세요. 찐막차 팀입니다.\n\n이번 v1.2 업데이트에서는 다음과 같은 기능들이 추가되었습니다.\n\n1. 주소 검색 기능 추가: 이제 출발지와 도착지를 더 쉽게 검색할 수 있습니다.\n2. UI 개선: 더 깔끔하고 사용하기 편한 디자인으로 변경되었습니다.\n3. 버그 수정: 간헐적으로 발생하던 경로 탐색 오류를 수정했습니다.\n\n앞으로도 많은 이용 부탁드립니다!' },
  ];

  // Smart Image Logic: Context-aware selection
  const getSmartPlaceImage = (place: Place) => {
      // 1. Check for custom image
      if (place.imageUrl) return place.imageUrl;

      const name = place.name;
      const type = place.type;
      const id = place.id;
      
      // Hash function for deterministic random selection within a category
      let hash = 0;
      for (let i = 0; i < id.length; i++) {
          hash = id.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      // Keyword Matching logic
      if (name.includes('별밤') || type.includes('술집') || type.includes('주점') || type.includes('포차') || type.includes('호프') || type.includes('Izakaya') || type.includes('Pub')) {
          const index = Math.abs(hash) % PLACE_IMAGES.PUB.length;
          return PLACE_IMAGES.PUB[index];
      }
      
      if (name.includes('해장국') || name.includes('국밥') || name.includes('순대') || type.includes('한식') || type.includes('Gukbap')) {
          const index = Math.abs(hash) % PLACE_IMAGES.SOUP.length;
          return PLACE_IMAGES.SOUP[index];
      }
      
      if (name.includes('다방') || name.includes('카페') || name.includes('커피') || type.includes('Cafe') || type.includes('디저트')) {
          const index = Math.abs(hash) % PLACE_IMAGES.CAFE.length;
          return PLACE_IMAGES.CAFE[index];
      }
      
      // Fallback
      const index = Math.abs(hash) % PLACE_IMAGES.DEFAULT.length;
      return PLACE_IMAGES.DEFAULT[index];
  };

  const parseDistance = (distStr: string): number => {
    const num = parseFloat(distStr.replace(/[^0-9.]/g, ''));
    if (distStr.includes('km')) return num * 1000;
    return num;
  };

  // Handlers
  const handleSearch = useCallback(async () => {
    if (!startLoc || !endLoc) {
        setError("출발지와 도착지를 모두 입력해주세요! 🥺");
        return;
    }
    setError('');
    setIsLoading(true);
    setAppState(AppState.SEARCHING);
    
    // Reset places when searching new route
    setNearbyPlaces([]);

    try {
      // Fetch Routes from TMAP Transit API
      const routeData = await getTmapTransitRoutes(startLoc, endLoc);
      const { routes: fetchedRoutes, fullTaxiCost: fetchedCost } = routeData;

      if (fetchedRoutes.length === 0) {
          setError("경로를 못 찾겠어요... 😭 조금 더 정확히 알려주세요!");
          setAppState(AppState.HOME);
      } else {
          setRoutes(fetchedRoutes);
          setFullTaxiCost(fetchedCost);
          // Always use mock places for now as requested
          setNearbyPlaces(MOCK_PLACES); 
          setAppState(AppState.RESULTS);
      }
    } catch (e) {
      console.error(e);
      setError("오류가 났어요... 다시 시도해주세요! 😵‍💫");
      setAppState(AppState.HOME);
    } finally {
      setIsLoading(false);
    }
  }, [startLoc, endLoc]);

  const handleFetchPlacesTab = async () => {
      // Called when clicking "Open Now" tab manually if empty
      if (nearbyPlaces.length > 0) return;
      
      setIsPlacesLoading(true);
      // Simulate network delay for effect
      await new Promise(resolve => setTimeout(resolve, 800));
      setNearbyPlaces(MOCK_PLACES);
      setIsPlacesLoading(false);
  };

  // Trigger fetch when tab changes to OPEN_NOW
  useEffect(() => {
      if (activeTab === 'OPEN_NOW') {
          handleFetchPlacesTab();
      }
  }, [activeTab]);

  const handleUseCurrentLocation = () => {
      if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(() => {
              setStartLoc("강남역 10번출구"); // Mock
          }, (err) => {
              console.error(err);
              setStartLoc("서울시청"); // Fallback
          });
      }
  };

  const handleSelectRoute = (route: HybridRoute) => {
    setSelectedRoute(route);
    setAppState(AppState.DETAILS);
  };

  const handleOpenNotificationModal = (e: React.MouseEvent, routeId: string) => {
      e.stopPropagation(); // Prevent route selection
      setActiveRouteId(routeId);
      setIsNotiModalOpen(true);
  };

  const handleSetNotification = (minutes: number | string) => {
      alert(`${typeof minutes === 'number' ? minutes + '분' : '설정하신 시간'} 전 알림이 설정되었습니다! 🔔`);
      setIsNotiModalOpen(false);
  };

  const handleBack = () => {
      if (appState === AppState.DETAILS) setAppState(AppState.RESULTS);
      else if (appState === AppState.RESULTS) setAppState(AppState.HOME);
      else if (appState === AppState.PLACE_DETAIL) {
          // If we came from Open Now Tab
          if (activeTab === 'OPEN_NOW') setSelectedPlace(null);
          // If we came from Search Results
          else setAppState(AppState.RESULTS);
      }
  };

  const handleKakaoTaxi = () => {
      window.location.href = 'https://t.kakao.com/'; 
  };

  const handleGoHome = () => {
      if (homeAddress) {
          setEndLoc(homeAddress);
          setActiveTab('SEARCH');
      } else {
          setActiveTab('MY_PAGE');
          alert("먼저 '내 정보'에서 집 주소를 등록해주세요! 🏠");
      }
  };

  const saveHomeAddress = () => {
      setHomeAddress(tempHomeAddress);
      setIsEditingHome(false);
  };

  const saveEmergencyPhone = () => {
      setEmergencyPhone(tempPhone);
      setIsEditingPhone(false);
  };
  
  const saveNickname = () => {
      if (tempNickname.trim()) {
        setNickname(tempNickname);
      }
      setIsEditingProfile(false);
  };

  const toggleNotifications = () => {
      setNotificationsEnabled(!notificationsEnabled);
  };

  // Calculate time remaining until departure with Fun Comments
  const calculatePlayTime = (departureTimeStr: string, index?: number) => {
    const now = new Date();
    const [targetHours, targetMinutes] = departureTimeStr.split(':').map(Number);
    let target = new Date();
    target.setHours(targetHours, targetMinutes, 0, 0);

    // Handle crossing midnight
    if (target.getTime() < now.getTime()) {
        if (now.getHours() > 20 && targetHours < 12) {
             target.setDate(target.getDate() + 1);
        }
    }

    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return { timeText: "지금 출발", comment: "놓치겠다! 뛰어!! 🏃‍♂️", urgent: true };

    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    let timeText = "";
    if (hours > 0) timeText += `${hours}시간 `;
    timeText += `${mins}분`;

    let comment = "";

    // Specific logic for routes
    if (index === 1) {
        comment = "막병 시키자~ 🍾";
    } else if (index === 2) {
        comment = "빠르게 2차 고? 🥂";
    } else if (index === 3) {
        comment = "해 뜰 때까지 마시는 거야~ ☀️";
    } else {
        if (diffMins < 20) {
             comment = "편의점도 못 들려! 서둘러! 💦";
        } else if (diffMins < 40) {
             comment = "아쉬운데 한 잔만 더? 🍺";
        } else if (diffMins < 60) {
             comment = "노래방 막곡 가능! 🎤"; 
        } else if (diffMins < 90) {
             comment = "천천히 마셔도 됨 🐢";
        } else {
             comment = "해장국 먹고 가도 되겠는데? 🍲";
        }
    }

    return { timeText, comment, urgent: diffMins < 20 && index !== 3 };
  };

  // --- Views ---

  // Splash Screen Render
  if (showSplash) {
      return (
          <div className="max-w-md mx-auto h-screen bg-brandBlue flex flex-col items-center justify-center text-white relative overflow-hidden shadow-2xl">
              {/* Background Decoration */}
              <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-white/10 rounded-full blur-[100px] animate-pulse"></div>
              <div className="absolute bottom-[-20%] right-[-20%] w-[400px] h-[400px] bg-brandPink/30 rounded-full blur-[80px]"></div>

              <div className="text-center z-10 p-6 flex flex-col items-center">
                  <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-8 shadow-2xl animate-bounce">
                      <Beer className="w-16 h-16 text-brandBlue transform -rotate-12" strokeWidth={2.5} />
                  </div>
                  
                  <h1 className="text-6xl font-black mb-6 tracking-tighter drop-shadow-md">
                      찐<span className="text-brandYellow">막차</span>
                  </h1>
                  
                  <div className="bg-white/20 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/30 shadow-lg">
                      <p className="text-lg font-bold animate-pulse leading-relaxed">
                          "{splashMessage}"
                      </p>
                  </div>

                  <div className="mt-12 flex flex-col items-center gap-2 opacity-70">
                      <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs font-bold">막차 시간표 로딩중...</span>
                  </div>
              </div>
          </div>
      );
  }

  const renderHome = () => (
    <div className="flex flex-col h-full px-6 pt-6 pb-20 bg-gradient-to-b from-blue-50 to-white overflow-y-auto">
      <div className="flex-1 flex flex-col justify-center items-center space-y-8 mt-4">
        <div className="text-center space-y-4">
            <div className="flex justify-center mb-6">
                <div className="relative w-36 h-36 animate-float">
                     <div className="absolute inset-0 bg-brandBlue/30 rounded-full blur-2xl"></div>
                     <div className="relative w-full h-full rounded-full border-8 border-white flex items-center justify-center bg-brandBlue shadow-2xl">
                         <Beer className="w-16 h-16 text-white transform -rotate-12" />
                         <div className="absolute top-0 right-0 bg-brandPink text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg transform rotate-12">
                             막차 구조대
                         </div>
                     </div>
                </div>
            </div>
          <h1 className="text-5xl font-black tracking-tight text-gray-800 drop-shadow-sm">
            찐<span className="text-brandBlue">막차</span>
          </h1>
          <p className="text-gray-500 font-medium text-lg bg-white px-5 py-2 rounded-full inline-block shadow-sm border border-gray-100">
            택시비 아껴서 <span className="text-brandPink font-bold">3차</span> 가자! 🍻
          </p>
        </div>

        <div className="w-full space-y-5 bg-white p-8 rounded-[2rem] border border-gray-100 shadow-xl">
          <div className="space-y-2">
            <label className="text-lg font-bold text-gray-700 ml-2 flex items-center gap-1">
                📍 출발지
            </label>
            <div className="flex space-x-2">
                <input
                    type="text"
                    value={startLoc}
                    onChange={(e) => setStartLoc(e.target.value)}
                    placeholder="어디서 출발해?"
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-brandBlue focus:bg-white rounded-2xl px-5 py-4 text-gray-800 focus:outline-none transition-all placeholder:text-gray-400 font-medium"
                />
                <button onClick={() => setPostcodeTarget('start')} className="p-4 bg-gray-50 rounded-2xl text-gray-500 hover:bg-gray-100 transition-colors whitespace-nowrap font-bold text-sm shrink-0">
                    주소찾기
                </button>
                <button onClick={handleUseCurrentLocation} className="p-4 bg-blue-50 rounded-2xl text-brandBlue hover:bg-blue-100 transition-colors shrink-0">
                    <MapPin className="w-6 h-6" />
                </button>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-lg font-bold text-gray-700 ml-2 flex items-center gap-1">
                🏁 도착지
            </label>
            <div className="flex space-x-2">
                <input
                    type="text"
                    value={endLoc}
                    onChange={(e) => setEndLoc(e.target.value)}
                    placeholder="어디로 갈까?"
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-brandMint focus:bg-white rounded-2xl px-5 py-4 text-gray-800 focus:outline-none transition-all placeholder:text-gray-400 font-medium"
                />
                <button onClick={() => setPostcodeTarget('end')} className="p-4 bg-gray-50 rounded-2xl text-gray-500 hover:bg-gray-100 transition-colors whitespace-nowrap font-bold text-sm shrink-0">
                    주소찾기
                </button>
            </div>
          </div>

          <div className="pt-2">
             <button 
                onClick={handleGoHome}
                className={`w-full py-3 rounded-2xl text-sm mb-4 border-2 border-dashed transition-all font-bold flex items-center justify-center gap-2 ${homeAddress ? 'bg-blue-50 border-brandBlue text-brandBlue' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-500'}`}
             >
                <Home size={16} />
                {homeAddress ? `우리 집으로 슝~` : '우리 집 등록하고 편하게 가기!'}
             </button>

            <button
                onClick={handleSearch}
                disabled={isLoading}
                className="w-full bg-brandBlue text-white font-black text-xl py-5 rounded-2xl shadow-lg shadow-blue-200 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-3 group"
            >
                {isLoading ? (
                    <span className="animate-pulse">머리 굴리는 중... 🧠</span>
                ) : (
                    <>
                        <span>경로 찾기</span>
                        <Search className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                    </>
                )}
            </button>
          </div>
          {error && <p className="text-brandPink text-center text-sm font-bold animate-bounce">{error}</p>}
        </div>
      </div>

      {postcodeTarget && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl relative">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="font-bold text-lg">주소 검색</h3>
                    <button onClick={() => setPostcodeTarget(null)} className="p-1 hover:bg-gray-100 rounded-full">
                        <X size={20} />
                    </button>
                </div>
                <div className="h-[400px] overflow-y-auto">
                    <DaumPostcode 
                        onComplete={(data) => {
                            if (postcodeTarget === 'start') setStartLoc(data.address);
                            if (postcodeTarget === 'end') setEndLoc(data.address);
                            setPostcodeTarget(null);
                        }}
                        autoClose={false}
                    />
                </div>
            </div>
        </div>
      )}
    </div>
  );

  const renderOpenNow = () => {
      // Filter & Sort Logic
      let displayPlaces = nearbyPlaces.length > 0 ? nearbyPlaces : [];
      
      // Filter
      if (placeCategory !== 'ALL') {
          displayPlaces = displayPlaces.filter(p => {
              if (placeCategory === 'PUB') return ['술집', '포차', '이자카야', '맥주', 'Pub'].some(k => p.type.includes(k) || p.name.includes(k));
              if (placeCategory === 'FOOD') return ['국밥', '식당', '한식', '음식'].some(k => p.type.includes(k) || p.name.includes(k));
              if (placeCategory === 'CAFE') return ['카페', '커피', 'Cafe'].some(k => p.type.includes(k) || p.name.includes(k));
              return true;
          });
      }

      // Sort
      displayPlaces.sort((a, b) => {
          if (placeSort === 'DISTANCE') {
              return parseDistance(a.distance) - parseDistance(b.distance);
          } else if (placeSort === 'RATING') {
              return parseFloat(b.rating) - parseFloat(a.rating);
          }
          return 0; // Default (Recommended order from array)
      });

      return (
        <div className="flex flex-col h-full bg-gray-50 pb-20">
            <header className="px-6 py-5 sticky top-0 z-20 bg-white/90 backdrop-blur-md shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-black text-gray-800">지금 영업중 🌙</h2>
                    <div className="bg-gray-100 px-3 py-1 rounded-full text-xs text-gray-500 font-bold flex items-center gap-1">
                        <MapPin size={12} />
                        {startLoc || "현재 위치"} 근처
                    </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-col gap-3">
                    {/* Categories */}
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                        {[
                            { id: 'ALL', label: '전체', icon: null },
                            { id: 'PUB', label: '술집/포차', icon: <Wine size={12}/> },
                            { id: 'FOOD', label: '해장/식사', icon: <Utensils size={12}/> },
                            { id: 'CAFE', label: '카페', icon: <Coffee size={12}/> },
                        ].map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setPlaceCategory(cat.id as PlaceCategory)}
                                className={`flex items-center gap-1 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all active:scale-95
                                    ${placeCategory === cat.id 
                                        ? 'bg-brandBlue text-white shadow-md shadow-blue-200' 
                                        : 'bg-white text-gray-500 border border-gray-200'}`}
                            >
                                {cat.icon}
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Sort Options */}
                    <div className="flex justify-end gap-3 text-xs font-bold text-gray-400">
                        <button onClick={() => setPlaceSort('RECOMMEND')} className={placeSort === 'RECOMMEND' ? 'text-brandBlue' : 'hover:text-gray-600'}>추천순</button>
                        <div className="w-[1px] bg-gray-200 h-3 my-auto"></div>
                        <button onClick={() => setPlaceSort('DISTANCE')} className={placeSort === 'DISTANCE' ? 'text-brandBlue' : 'hover:text-gray-600'}>거리순</button>
                        <div className="w-[1px] bg-gray-200 h-3 my-auto"></div>
                        <button onClick={() => setPlaceSort('RATING')} className={placeSort === 'RATING' ? 'text-brandBlue' : 'hover:text-gray-600'}>별점순</button>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {isPlacesLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 space-y-4">
                        <div className="w-12 h-12 border-4 border-gray-200 border-t-brandPink rounded-full animate-spin"></div>
                        <p className="text-gray-400 font-bold animate-pulse">핫한 곳 찾는 중... 👀</p>
                    </div>
                ) : displayPlaces.length > 0 ? (
                    displayPlaces.map((place) => (
                        <div 
                            key={place.id}
                            onClick={() => { setSelectedPlace(place); }}
                            className="bg-white rounded-[2rem] overflow-hidden border border-gray-100 active:scale-[0.98] transition-all cursor-pointer shadow-lg hover:shadow-xl group"
                        >
                            <div className="h-44 w-full relative bg-gray-200">
                            <img 
                                src={getSmartPlaceImage(place)} 
                                alt={place.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                            
                            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm text-white px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                                <Navigation size={10} className="text-brandMint" />
                                {place.distance}
                            </div>

                            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm text-gray-800 px-3 py-1 rounded-full text-xs font-black shadow-lg">
                                {place.closingTime} 마감
                            </div>

                            <div className="absolute bottom-4 left-4 text-white right-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="bg-brandPink text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">{place.type}</span>
                                    <span className="flex items-center text-yellow-400 text-xs font-bold gap-0.5 drop-shadow-md"><Star size={10} fill="currentColor"/> {place.rating}</span>
                                </div>
                                <h3 className="text-xl font-black shadow-black drop-shadow-md truncate">{place.name}</h3>
                            </div>
                            </div>
                            
                            <div className="p-5">
                            <div className="flex items-center gap-2 mb-3 bg-gray-50 p-2 rounded-xl">
                                <Utensils size={14} className="text-gray-400" />
                                <p className="text-gray-600 text-xs font-bold truncate">대표: <span className="text-gray-800">{place.representativeMenu}</span></p>
                            </div>
                            <p className="text-gray-500 text-sm mb-3 line-clamp-2 font-medium leading-relaxed">{place.description}</p>
                            <div className="flex flex-wrap gap-2">
                                {place.tags.map((tag, i) => (
                                    <span key={i} className="text-[10px] font-bold text-brandBlue bg-blue-50 px-2 py-1 rounded-lg">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-20 text-gray-400">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Search size={24} className="text-gray-300"/>
                        </div>
                        <p>해당하는 장소가 없어요. 😢</p>
                        {nearbyPlaces.length === 0 && (
                            <button onClick={handleFetchPlacesTab} className="mt-4 text-brandPink font-bold underline">다시 시도하기</button>
                        )}
                    </div>
                )}
            </div>
            
            {selectedPlace && (
                <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white text-gray-800 w-full max-w-sm rounded-[2.5rem] overflow-hidden relative shadow-2xl animate-float flex flex-col max-h-[80vh]">
                        
                        <div className="relative h-48 shrink-0">
                            <img 
                                src={getSmartPlaceImage(selectedPlace)} 
                                className="w-full h-full object-cover"
                                alt="Header"
                            />
                            <button 
                                onClick={() => setSelectedPlace(null)}
                                className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-800 hover:bg-white transition-colors shadow-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-2">
                                        <span className="bg-brandPink text-white text-xs font-black px-3 py-1 rounded-full">{selectedPlace.type}</span>
                                        <div className="flex items-center gap-1 text-yellow-500 font-bold bg-yellow-50 px-2 py-1 rounded-lg">
                                            <Star size={14} fill="currentColor"/>
                                            <span className="text-sm">{selectedPlace.rating}</span>
                                        </div>
                                </div>
                                <h2 className="text-3xl font-black text-gray-800 leading-tight">{selectedPlace.name}</h2>
                            </div>

                            <div className="space-y-5 mb-8">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-gray-50 rounded-2xl text-brandBlue">
                                        <MapPin size={20} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold mb-1">위치 ({selectedPlace.distance})</p>
                                        <p className="text-gray-700 font-bold leading-snug">{selectedPlace.address}</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-gray-50 rounded-2xl text-brandPink">
                                        <Clock size={20} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold mb-1">영업 시간</p>
                                        <p className="text-gray-700 font-bold">{selectedPlace.closingTime}까지 영업</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-gray-50 rounded-2xl text-brandPurple">
                                        <Utensils size={20} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold mb-1">대표 메뉴</p>
                                        <p className="text-gray-700 font-bold">{selectedPlace.representativeMenu}</p>
                                    </div>
                                </div>

                                <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100">
                                    <p className="text-brandBlue font-medium leading-relaxed">"{selectedPlace.description}"</p>
                                </div>
                            </div>

                            <button className="w-full bg-brandBlue text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-200 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 text-lg">
                                <Navigation size={22} />
                                길찾기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      );
  }

  const renderHistory = () => (
      <div className="flex flex-col h-full bg-gray-50 pb-20">
          <header className="px-6 py-5 flex items-center bg-white sticky top-0 z-20 shadow-sm">
              <h2 className="text-2xl font-black text-gray-800">이용 / 알림 🔔</h2>
          </header>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {historyData.map((item, index) => (
                  <div 
                      key={index} 
                      onClick={() => item.type === 'alert' && setSelectedNotice(item)}
                      className={`bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-4 ${item.type === 'alert' ? 'cursor-pointer hover:bg-gray-50 active:scale-[0.98] transition-all' : ''}`}
                  >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${item.type === 'alert' ? 'bg-red-50 text-brandPink' : 'bg-blue-50 text-brandBlue'}`}>
                          {item.type === 'alert' ? <Bell size={20} /> : <div className="text-xl">{item.icon}</div>}
                      </div>
                      <div className="flex-1">
                          {item.type === 'alert' ? (
                              <>
                                  <div className="flex justify-between items-start mb-1">
                                      <p className="font-bold text-gray-800">{item.title}</p>
                                      <span className="text-xs text-gray-400 font-medium">{item.date}</span>
                                  </div>
                                  <p className="text-sm text-gray-500">{item.desc}</p>
                              </>
                          ) : (
                              <>
                                  <div className="flex justify-between items-start mb-1">
                                      <p className="font-bold text-gray-800">{item.route}</p>
                                      <span className="text-xs text-gray-400 font-medium">{item.date}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-2">
                                      <span className="text-xs font-bold bg-gray-100 text-gray-500 px-2 py-1 rounded-md">결제 {item.cost}</span>
                                      <span className="text-xs font-bold bg-brandMint/10 text-brandMint px-2 py-1 rounded-md">절약 {item.saved}</span>
                                  </div>
                              </>
                          )}
                      </div>
                  </div>
              ))}
              
              <div className="text-center mt-8">
                  <p className="text-gray-400 text-sm">최근 3개월 내역만 표시됩니다.</p>
              </div>
          </div>

          {/* Notice Detail Modal */}
          {selectedNotice && (
              <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-right-full duration-300">
                  <header className="px-6 py-5 flex items-center border-b border-gray-100 bg-white sticky top-0">
                      <button onClick={() => setSelectedNotice(null)} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
                          <ChevronLeft size={24} />
                      </button>
                      <h2 className="text-xl font-black text-gray-800 ml-2">공지사항</h2>
                  </header>
                  <div className="flex-1 overflow-y-auto p-6">
                      <div className="mb-6">
                          <div className="flex items-center gap-2 mb-3">
                              <span className="bg-brandPink/10 text-brandPink text-xs font-bold px-2 py-1 rounded-md">알림</span>
                              <span className="text-sm text-gray-400 font-medium">{selectedNotice.date}</span>
                          </div>
                          <h1 className="text-2xl font-black text-gray-800 leading-tight mb-2">{selectedNotice.title}</h1>
                      </div>
                      <div className="w-full h-[1px] bg-gray-100 mb-6"></div>
                      <div className="prose prose-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                          {selectedNotice.content}
                      </div>
                  </div>
              </div>
          )}
      </div>
  );

  const renderMyPage = () => (
    <div className="flex flex-col h-full bg-gray-50 pb-20">
        <header className="px-6 py-5 flex items-center bg-white sticky top-0 z-20 shadow-sm border-b border-gray-50">
            <h2 className="text-2xl font-black text-gray-800">내 정보 🦄</h2>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Profile & Savings Dashboard */}
            <div className="bg-gradient-to-br from-brandBlue to-blue-500 p-6 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all"></div>
                
                {/* Edit Nickname Button */}
                <button 
                    onClick={() => { setIsEditingProfile(true); setTempNickname(nickname); }}
                    className="absolute top-6 right-6 p-2 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur-md transition-colors z-20"
                >
                    <Edit2 size={16} className="text-white" />
                </button>

                <div className="flex items-center space-x-4 mb-6 relative z-10">
                    <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/30 backdrop-blur-md">
                        <User className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                             <h3 className="text-2xl font-black">{nickname}</h3>
                             <span className="text-[10px] bg-brandYellow text-gray-800 font-black px-2 py-0.5 rounded-full shadow-sm">LV. 3</span>
                        </div>
                        <p className="text-blue-100 text-sm font-medium">서울 마스터</p>
                    </div>
                </div>
                
                <div className="bg-black/20 rounded-2xl p-4 backdrop-blur-md border border-white/10">
                    <div className="flex justify-between items-end mb-2">
                        <p className="text-blue-100 text-xs font-bold">이번 달 절약 금액</p>
                        <p className="text-2xl font-black">42,000원</p>
                    </div>
                    <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden mb-2">
                        <div className="bg-brandYellow h-full rounded-full w-[80%] shadow-[0_0_10px_rgba(255,217,61,0.5)]"></div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-bold text-blue-100">
                        <span className="flex items-center gap-1"><TrendingUp size={10} /> 목표: 치킨 먹기</span>
                        <span>8,000원 남음</span>
                    </div>
                </div>
            </div>

            {/* Grid Layout for Settings */}
            <div className="grid grid-cols-2 gap-4">
                 {/* Notification Settings - UPDATED DESIGN */}
                <div 
                    onClick={toggleNotifications}
                    className={`p-5 rounded-[2rem] shadow-sm border transition-all cursor-pointer active:scale-95 h-36 flex flex-col justify-between group ${notificationsEnabled ? 'bg-white border-brandYellow ring-2 ring-brandYellow/20' : 'bg-gray-50 border-gray-200'}`}
                >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${notificationsEnabled ? 'bg-brandYellow text-white' : 'bg-gray-200 text-gray-400'}`}>
                        {notificationsEnabled ? <BellRing size={20} className="fill-white" /> : <Bell size={20} />}
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <h3 className={`font-bold transition-colors ${notificationsEnabled ? 'text-gray-900' : 'text-gray-500'}`}>알림 {notificationsEnabled ? 'ON' : 'OFF'}</h3>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${notificationsEnabled ? 'bg-brandYellow justify-end' : 'bg-gray-300 justify-start'}`}>
                                <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 font-bold">막차 & 할인 정보</p>
                    </div>
                </div>

                {/* Safe Return Settings */}
                <div 
                    onClick={() => setIsEditingPhone(true)}
                    className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col justify-between h-36 cursor-pointer active:scale-95 transition-transform"
                >
                    <div className="w-10 h-10 rounded-full bg-brandPink/10 text-brandPink flex items-center justify-center mb-2">
                        <Shield size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 mb-1">안심 귀가</h3>
                        <p className="text-[10px] text-gray-400 font-bold truncate">{emergencyPhone === '010-xxxx-xxxx' ? '비상 연락처 설정' : emergencyPhone}</p>
                    </div>
                </div>

                {/* Walk Preference */}
                <div 
                    onClick={() => setWalkPreference(walkPreference === 'CHEAP' ? 'SHORT' : 'CHEAP')}
                    className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col justify-between h-36 cursor-pointer active:scale-95 transition-transform"
                >
                     <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${walkPreference === 'CHEAP' ? 'bg-brandMint/10 text-brandMint' : 'bg-brandPurple/10 text-brandPurple'}`}>
                        <Footprints size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 mb-1">이동 취향</h3>
                        <p className="text-[10px] text-gray-400 font-bold">
                            {walkPreference === 'CHEAP' ? '💸 비용 절약형' : '🚶 최소 도보형'}
                        </p>
                    </div>
                </div>

                 {/* Home Address */}
                 <div 
                    onClick={() => { setIsEditingHome(true); setTempHomeAddress(homeAddress); }}
                    className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col justify-between h-36 cursor-pointer active:scale-95 transition-transform"
                >
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-brandBlue flex items-center justify-center mb-2">
                        <Home size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 mb-1">우리 집</h3>
                        <p className="text-[10px] text-gray-400 font-bold truncate">{homeAddress || "설정 필요"}</p>
                    </div>
                </div>
            </div>

            {/* Editing Modals/Inputs */}
            {isEditingProfile && (
                <div className="bg-white p-5 rounded-[2rem] border-2 border-brandBlue/20 shadow-lg animate-float">
                    <p className="text-sm font-bold text-gray-500 mb-2">✏️ 닉네임을 수정해주세요</p>
                    <input 
                        type="text" 
                        value={tempNickname}
                        onChange={(e) => setTempNickname(e.target.value)}
                        placeholder="새 닉네임"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:border-brandBlue font-bold text-gray-800"
                        autoFocus
                        maxLength={10}
                    />
                    <div className="flex gap-2">
                        <button onClick={() => setIsEditingProfile(false)} className="flex-1 py-3 text-gray-500 bg-gray-100 rounded-xl font-bold">취소</button>
                        <button onClick={saveNickname} className="flex-1 py-3 text-white bg-brandBlue rounded-xl font-bold shadow-md shadow-blue-200">저장</button>
                    </div>
                </div>
            )}

            {isEditingHome && (
                <div className="bg-white p-5 rounded-[2rem] border-2 border-brandBlue/20 shadow-lg animate-float">
                    <p className="text-sm font-bold text-gray-500 mb-2">🏠 도로명 주소를 입력해주세요</p>
                    <input 
                        type="text" 
                        value={tempHomeAddress}
                        onChange={(e) => setTempHomeAddress(e.target.value)}
                        placeholder="예: 강남대로 123"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:border-brandBlue font-bold"
                        autoFocus
                    />
                    <div className="flex gap-2">
                        <button onClick={() => setIsEditingHome(false)} className="flex-1 py-3 text-gray-500 bg-gray-100 rounded-xl font-bold">취소</button>
                        <button onClick={saveHomeAddress} className="flex-1 py-3 text-white bg-brandBlue rounded-xl font-bold shadow-md shadow-blue-200">저장</button>
                    </div>
                </div>
            )}

            {isEditingPhone && (
                <div className="bg-white p-5 rounded-[2rem] border-2 border-brandPink/20 shadow-lg animate-float">
                    <p className="text-sm font-bold text-gray-500 mb-2">🛡️ 비상 연락처를 입력해주세요</p>
                    <input 
                        type="tel" 
                        value={tempPhone}
                        onChange={(e) => setTempPhone(e.target.value)}
                        placeholder="010-0000-0000"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:border-brandPink font-bold"
                        autoFocus
                    />
                    <div className="flex gap-2">
                        <button onClick={() => setIsEditingPhone(false)} className="flex-1 py-3 text-gray-500 bg-gray-100 rounded-xl font-bold">취소</button>
                        <button onClick={saveEmergencyPhone} className="flex-1 py-3 text-white bg-brandPink rounded-xl font-bold shadow-md shadow-red-200">저장</button>
                    </div>
                </div>
            )}

            {/* Payment Method - UPDATED DESIGN */}
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-gray-400" />
                        결제 수단
                    </h3>
                    <button className="text-xs font-bold text-brandBlue bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors">
                        관리
                    </button>
                </div>
                
                <div className="space-y-3">
                    {/* Existing Card */}
                    <div className="bg-[#FEE500] p-4 rounded-2xl flex items-center justify-between shadow-sm border border-yellow-400/20 group cursor-pointer hover:shadow-md transition-all">
                        <div className="flex items-center gap-3">
                            <div className="bg-black/10 p-2 rounded-xl group-hover:scale-110 transition-transform">
                                <span className="font-black text-[10px] text-gray-800">PAY</span>
                            </div>
                            <div>
                                <span className="font-bold text-gray-900 text-sm block">카카오페이</span>
                                <span className="text-[10px] text-gray-600 font-medium">기본 결제 수단</span>
                            </div>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-black/20 flex items-center justify-center">
                             <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                        </div>
                    </div>

                    {/* Add Button */}
                    <button className="w-full py-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 font-bold hover:border-brandBlue hover:text-brandBlue hover:bg-blue-50 transition-all flex items-center justify-center gap-2 group">
                        <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Plus size={14} strokeWidth={3} />
                        </div>
                        <span>새 카드 추가하기</span>
                    </button>
                </div>
            </div>

            {/* Footer Links */}
            <div className="space-y-2">
                 <button className="w-full bg-white p-5 rounded-[2rem] border border-gray-100 flex justify-between items-center text-gray-600 font-bold hover:bg-gray-50 transition-colors">
                     <span className="flex items-center gap-2"><FileText size={16} className="text-gray-400"/> 공지사항</span>
                     <ChevronRight size={16} className="text-gray-400"/>
                 </button>
                 <button className="w-full bg-white p-5 rounded-[2rem] border border-gray-100 flex justify-between items-center text-gray-600 font-bold hover:bg-gray-50 transition-colors">
                     <span className="flex items-center gap-2"><Phone size={16} className="text-gray-400"/> 고객센터</span>
                     <ChevronRight size={16} className="text-gray-400"/>
                 </button>
            </div>

            <div className="text-center py-6">
                <p className="text-xs text-gray-400 font-bold mb-1">찐막차 v2.1.0</p>
                <p className="text-[10px] text-gray-300">Designed for Safe & Fun Nightlife</p>
            </div>
        </div>
    </div>
  );

  const renderLoading = () => (
      <div className="flex flex-col h-full items-center justify-center p-6 space-y-8 text-center bg-blue-50">
          <div className="relative">
              <div className="w-24 h-24 border-8 border-white border-t-brandBlue rounded-full animate-spin shadow-lg"></div>
              <div className="absolute inset-0 flex items-center justify-center text-3xl animate-bounce">🤔</div>
          </div>
          <div>
              <h2 className="text-3xl font-black text-gray-800 mb-3">최적의 경로 계산 중!</h2>
              <p className="text-gray-500 text-lg">막차 시간표 확인하고<br/>택시비 계산하는 중이에요...</p>
          </div>
      </div>
  );

  const renderResults = () => (
    <div className="flex flex-col h-full bg-gray-50 pb-20">
        <header className="px-6 py-5 flex items-center bg-white/80 backdrop-blur-md sticky top-0 z-20 shadow-sm">
            <button onClick={handleBack} className="p-2 -ml-2 text-gray-400 hover:text-gray-800 rounded-full hover:bg-gray-100 transition-colors">
                <ChevronLeft className="w-8 h-8" />
            </button>
            <h2 className="ml-2 text-2xl font-black text-gray-800">추천 경로 🚕🚌</h2>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div className="bg-white rounded-3xl p-6 border border-gray-100 text-center shadow-lg">
               <h3 className="text-gray-400 text-sm mb-2 font-bold">택시만 타면 이만큼 깨져요 💸</h3>
               <p className="text-4xl font-black text-brandPink line-through decoration-gray-300 decoration-4">{fullTaxiCost.toLocaleString()}원</p>
            </div>

            {routes.map((route, index) => {
                // Pass the index to get specific funny comments for routes 2 and 3
                const { timeText, comment, urgent } = calculatePlayTime(route.departureTime, index);
                
                return (
                    <div 
                        key={route.id}
                        onClick={() => handleSelectRoute(route)}
                        className="bg-white rounded-[2rem] overflow-hidden border border-gray-100 hover:border-brandBlue transition-all cursor-pointer group shadow-xl hover:-translate-y-1 relative"
                    >
                        <div className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-brandBlue text-white text-[10px] font-black px-2 py-0.5 rounded-full">추천 {index + 1}</span>
                                    </div>
                                    <h3 className="text-xl font-black text-gray-800 group-hover:text-brandBlue transition-colors">{route.name}</h3>
                                    <p className="text-sm text-gray-500 mt-1 font-medium">
                                        🚏 환승: <span className="text-gray-800 font-bold">{route.transferPoint}</span>
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                     <button 
                                        onClick={(e) => handleOpenNotificationModal(e, route.id)}
                                        className="p-2 bg-gray-50 text-gray-400 hover:bg-brandBlue hover:text-white rounded-full transition-colors active:scale-95"
                                     >
                                         <BellRing size={20} />
                                     </button>
                                    <div className="bg-brandMint/10 text-brandMint px-3 py-1.5 rounded-full font-bold text-sm border border-brandMint/20 whitespace-nowrap">
                                        -{route.savedAmount.toLocaleString()}원
                                    </div>
                                </div>
                            </div>

                            {/* Play Time Badge with Fun Comment */}
                            <div className={`mb-5 rounded-2xl p-4 flex items-center gap-3 ${urgent ? 'bg-red-50' : 'bg-blue-50'}`}>
                                <div className={`p-2 rounded-full ${urgent ? 'bg-red-100' : 'bg-blue-100'}`}>
                                    <Clock className={`w-5 h-5 ${urgent ? 'text-red-500' : 'text-brandBlue'}`} />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 font-bold">막차까지 <span className="text-gray-800">{timeText}</span> 남음</p>
                                    <p className={`text-base font-black ${urgent ? 'text-red-500' : 'text-brandBlue'}`}>
                                        "{comment}"
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center space-x-4 mb-5">
                                <div className="flex-1">
                                    <p className="text-xs text-gray-400 mb-1 font-bold">총 비용</p>
                                    <p className="text-2xl font-black text-gray-800">{route.totalCost.toLocaleString()}원</p>
                                </div>
                                <div className="w-0.5 h-10 bg-gray-100"></div>
                                <div className="flex-1">
                                    <p className="text-xs text-gray-400 mb-1 font-bold">막차 출발</p>
                                    <Countdown targetTimeStr={route.departureTime} />
                                </div>
                            </div>

                            <div className="w-full h-3 bg-gray-100 rounded-full flex overflow-hidden">
                                {route.segments.map((seg, idx) => (
                                    <div 
                                        key={idx} 
                                        className={`h-full ${
                                            seg.type === 'walk' ? 'bg-gray-400' :
                                            seg.type === 'taxi' ? 'bg-brandYellow' :
                                            seg.type === 'subway' ? 'bg-brandMint' : 'bg-brandBlue'
                                        }`}
                                        style={{ flex: seg.durationMinutes }}
                                    ></div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })}
            
            {/* Nearby Places Section in Search Results */}
            {nearbyPlaces.length > 0 && (
                <div className="pt-4">
                    <div className="flex items-center gap-2 mb-4">
                        <Beer className="text-brandYellow fill-brandYellow" size={20} />
                        <h3 className="text-xl font-black text-gray-800">아쉬우면 한잔 더? 🍻</h3>
                    </div>
                    <div className="flex overflow-x-auto gap-4 pb-4 -mx-5 px-5 snap-x hide-scrollbar">
                        {nearbyPlaces.slice(0, 3).map((place) => (
                            <div 
                                key={place.id} 
                                onClick={() => { setSelectedPlace(place); }}
                                className="min-w-[200px] w-[200px] bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm snap-center active:scale-95 transition-transform"
                            >
                                <div className="h-24 bg-gray-200 relative">
                                    <img 
                                        src={getSmartPlaceImage(place)} 
                                        alt={place.name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                    <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-md text-[10px] font-bold text-gray-600">
                                        {place.closingTime}
                                    </div>
                                </div>
                                <div className="p-3">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[10px] font-bold bg-brandBlue/10 text-brandBlue px-2 py-0.5 rounded-full">{place.type}</span>
                                        <div className="flex items-center gap-0.5">
                                            <Star size={10} className="text-brandYellow fill-brandYellow" />
                                            <span className="text-xs font-bold text-gray-700">{place.rating}</span>
                                        </div>
                                    </div>
                                    <h4 className="font-bold text-gray-800 text-md truncate mb-0.5">{place.name}</h4>
                                    <p className="text-[10px] text-gray-400 line-clamp-1">{place.address}</p>
                                </div>
                            </div>
                        ))}
                        <div 
                            onClick={() => setActiveTab('OPEN_NOW')}
                            className="min-w-[100px] flex flex-col items-center justify-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 font-bold gap-2 cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                            <div className="p-2 bg-white rounded-full shadow-sm">
                                <ArrowRight size={20} />
                            </div>
                            <span className="text-xs">더보기</span>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Notification Modal */}
        {isNotiModalOpen && (
            <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 animate-float shadow-2xl relative">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-2xl font-black text-gray-800">몇 분 전에 알려드릴까요? ⏰</h3>
                            <p className="text-gray-400 text-sm font-bold">막차 놓치지 않게 챙겨드릴게요!</p>
                        </div>
                        <button onClick={() => setIsNotiModalOpen(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        {[5, 10, 15, 30, 60].map(min => (
                            <button 
                                key={min}
                                onClick={() => handleSetNotification(min)}
                                className="py-4 rounded-2xl bg-blue-50 text-brandBlue font-black hover:bg-brandBlue hover:text-white transition-all text-lg active:scale-95"
                            >
                                {min === 60 ? '1시간' : `${min}분`}
                            </button>
                        ))}
                        <button 
                            className="py-4 rounded-2xl bg-gray-100 text-gray-500 font-black hover:bg-gray-200 transition-all text-lg active:scale-95"
                             onClick={() => handleSetNotification('직접 설정')}
                        >
                            직접설정
                        </button>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-brandPink font-bold bg-red-50 inline-block px-3 py-1 rounded-full">
                            ⚠️ 막차 시간 기준 알림입니다.
                        </p>
                    </div>
                </div>
            </div>
        )}
        
        {selectedPlace && (
              <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-md">
                  <div className="bg-white text-gray-800 w-full max-w-sm rounded-[2.5rem] overflow-hidden relative shadow-2xl animate-float flex flex-col max-h-[80vh]">
                      
                      <div className="relative h-48 shrink-0">
                          <img 
                            src={getSmartPlaceImage(selectedPlace)} 
                            className="w-full h-full object-cover"
                            alt="Header"
                          />
                          <button 
                            onClick={() => setSelectedPlace(null)}
                            className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-800 hover:bg-white transition-colors shadow-lg"
                        >
                            <X size={20} />
                        </button>
                      </div>

                      <div className="p-6 overflow-y-auto">
                          <div className="mb-6">
                               <div className="flex items-center gap-2 mb-2">
                                    <span className="bg-brandPink text-white text-xs font-black px-3 py-1 rounded-full">{selectedPlace.type}</span>
                                    <div className="flex items-center gap-1 text-yellow-500 font-bold bg-yellow-50 px-2 py-1 rounded-lg">
                                        <Star size={14} fill="currentColor"/>
                                        <span className="text-sm">{selectedPlace.rating}</span>
                                    </div>
                               </div>
                               <h2 className="text-3xl font-black text-gray-800 leading-tight">{selectedPlace.name}</h2>
                          </div>

                          <div className="space-y-5 mb-8">
                              <div className="flex items-start gap-4">
                                  <div className="p-3 bg-gray-50 rounded-2xl text-brandBlue">
                                      <MapPin size={20} />
                                  </div>
                                  <div>
                                      <p className="text-xs text-gray-400 font-bold mb-1">위치 ({selectedPlace.distance})</p>
                                      <p className="text-gray-700 font-bold leading-snug">{selectedPlace.address}</p>
                                  </div>
                              </div>
                              
                              <div className="flex items-start gap-4">
                                  <div className="p-3 bg-gray-50 rounded-2xl text-brandPink">
                                      <Clock size={20} />
                                  </div>
                                  <div>
                                      <p className="text-xs text-gray-400 font-bold mb-1">영업 시간</p>
                                      <p className="text-gray-700 font-bold">{selectedPlace.closingTime}까지 영업</p>
                                  </div>
                              </div>
                              
                              <div className="flex items-start gap-4">
                                  <div className="p-3 bg-gray-50 rounded-2xl text-brandPurple">
                                      <Utensils size={20} />
                                  </div>
                                  <div>
                                      <p className="text-xs text-gray-400 font-bold mb-1">대표 메뉴</p>
                                      <p className="text-gray-700 font-bold">{selectedPlace.representativeMenu}</p>
                                  </div>
                              </div>

                              <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100">
                                  <p className="text-brandBlue font-medium leading-relaxed">"{selectedPlace.description}"</p>
                              </div>
                          </div>

                          <button className="w-full bg-brandBlue text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-200 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 text-lg">
                              <Navigation size={22} />
                              길찾기
                          </button>
                      </div>
                  </div>
              </div>
          )}
    </div>
  );

  const renderDetails = () => {
    if (!selectedRoute) return renderResults();

    return (
      <div className="flex flex-col h-full bg-gray-50 pb-20">
        <header className="px-6 py-5 flex items-center bg-white/80 backdrop-blur-md sticky top-0 z-20 shadow-sm">
          <button onClick={handleBack} className="p-2 -ml-2 text-gray-400 hover:text-gray-800 rounded-full hover:bg-gray-100 transition-colors">
            <ChevronLeft className="w-8 h-8" />
          </button>
          <h2 className="ml-2 text-2xl font-black text-gray-800">상세 경로 🧐</h2>
        </header>

        <div className="flex-1 overflow-y-auto pb-6 space-y-6">
          <div className="bg-white rounded-b-[2.5rem] shadow-lg border-b border-gray-100 overflow-hidden">
             
             {/* Map at the top of details, taking full width */}
             <div className="w-full relative shadow-inner z-0 border-b border-gray-100">
                 <TmapRouteView route={selectedRoute} height="40vh" />
             </div>

             <div className="p-6">
                 <div className="flex justify-between items-start mb-4 mt-2">
                     <h3 className="text-2xl font-black text-gray-800 leading-tight">{selectedRoute.name}</h3>
                     <span className="bg-brandMint text-white text-xs font-black px-3 py-1 rounded-full whitespace-nowrap">
                        {selectedRoute.savedAmount.toLocaleString()}원 절약
                     </span>
                 </div>
                 <div className="flex items-center gap-4 text-gray-600 font-bold mb-6">
                     <div className="flex items-center gap-1">
                         <Clock size={18} className="text-brandBlue"/>
                         <span>{selectedRoute.totalDuration}분</span>
                     </div>
                     <div className="flex items-center gap-1">
                         <CreditCard size={18} className="text-brandPink"/>
                         <span>{selectedRoute.totalCost.toLocaleString()}원</span>
                     </div>
                 </div>

                 <div className="mt-4 bg-gray-50 p-4 rounded-3xl border border-gray-100">
                     <CostChart taxiCost={fullTaxiCost} hybridCost={selectedRoute.totalCost} />
                 </div>
             </div>
          </div>

          <div className="space-y-4 px-6">
              <h4 className="text-lg font-black text-gray-800 ml-2">이동 경로</h4>
              <div className="relative border-l-4 border-gray-200 ml-4 space-y-8 py-2">
                  {selectedRoute.segments.map((segment, idx) => (
                      <div key={idx} className="relative pl-8">
                          <div className={`absolute -left-[11px] top-0 w-5 h-5 rounded-full border-4 border-white shadow-sm flex items-center justify-center
                              ${segment.type === 'walk' ? 'bg-gray-400' : 
                                segment.type === 'bus' ? 'bg-brandBlue' : 
                                segment.type === 'subway' ? 'bg-brandMint' : 'bg-brandYellow'}`}
                          >
                          </div>
                          
                          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                              <div className="flex justify-between items-start mb-2">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase
                                      ${segment.type === 'walk' ? 'bg-gray-100 text-gray-500' : 
                                        segment.type === 'bus' ? 'bg-blue-50 text-brandBlue' : 
                                        segment.type === 'subway' ? 'bg-green-50 text-brandMint' : 'bg-yellow-50 text-yellow-600'}`}>
                                      {segment.type === 'taxi' ? '택시 (환승)' : 
                                       segment.type === 'walk' ? '도보' : 
                                       segment.lineName || segment.type}
                                  </span>
                                  <span className="text-xs font-bold text-gray-400">{segment.durationMinutes}분</span>
                              </div>
                              <p className="text-gray-800 font-bold text-lg mb-1">{segment.instruction}</p>
                              {/* 출발/도착 시간 */}
                              {(segment as any).departureTime && (
                                <div className="flex items-center gap-3 mt-1 mb-1">
                                  <span className="text-xs font-bold text-brandBlue bg-blue-50 px-2 py-1 rounded-lg">
                                    🕐 출발 {(segment as any).departureTime}
                                  </span>
                                  {(segment as any).arrivalTime && (
                                    <span className="text-xs font-bold text-brandMint bg-green-50 px-2 py-1 rounded-lg">
                                      🏁 도착 {(segment as any).arrivalTime}
                                    </span>
                                  )}
                                </div>
                              )}
                              {segment.cost > 0 && (
                                  <p className="text-sm text-gray-500 font-medium">예상 비용: {segment.cost.toLocaleString()}원</p>
                              )}
                              {/* 실시간 도착 정보 */}
                              {(segment.type === 'subway' || segment.type === 'bus') && (segment as any).startName && (
                                <RealTimeArrival
                                  type={segment.type}
                                  stationName={(segment as any).startName}
                                  lineName={segment.lineName}
                                />
                              )}
                          </div>
                      </div>
                  ))}
                  
                  <div className="relative pl-8">
                      <div className="absolute -left-[11px] top-0 w-5 h-5 rounded-full bg-gray-800 border-4 border-white shadow-sm"></div>
                      <p className="font-black text-gray-800 text-lg">도착! 🏠</p>
                  </div>
              </div>
          </div>
          
           <button 
                onClick={handleKakaoTaxi}
                className="w-full bg-[#FEE500] text-gray-900 font-black text-xl py-5 rounded-2xl shadow-lg hover:brightness-95 active:scale-95 transition-all flex items-center justify-center gap-2"
           >
                <Car size={24} />
                <span>카카오T 호출하기</span>
           </button>
        </div>
      </div>
    );
  };

  const renderContent = () => {
      // Priority Check for Open Now Tab content
      if (activeTab === 'OPEN_NOW') return renderOpenNow();

      switch(activeTab) {
          case 'SEARCH':
              switch(appState) {
                  case AppState.HOME: return renderHome();
                  case AppState.SEARCHING: return renderLoading();
                  case AppState.RESULTS: return renderResults();
                  case AppState.DETAILS: return renderDetails();
                  case AppState.PLACE_DETAIL: return renderResults(); // Fallback if stuck
                  default: return renderHome();
              }
          case 'HISTORY': return renderHistory();
          case 'MY_PAGE': return renderMyPage();
          default: return renderHome();
      }
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-white text-gray-800 font-sans overflow-hidden shadow-2xl relative flex flex-col">
       <div className="flex-1 overflow-hidden relative">
            {renderContent()}
       </div>
       
       {/* Bottom Navigation */}
       <div className="absolute bottom-0 w-full bg-white border-t border-gray-100 flex justify-around items-end py-2 z-50 rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.08)] px-2">
            <button 
                onClick={() => setActiveTab('SEARCH')} 
                className={`flex flex-col items-center gap-0.5 p-2 rounded-2xl transition-all duration-300 w-16 group ${activeTab === 'SEARCH' ? 'text-brandBlue -translate-y-1' : 'text-gray-300 hover:text-gray-400'}`}
            >
                <div className={`p-1.5 rounded-full transition-all ${activeTab === 'SEARCH' ? 'bg-blue-50 shadow-inner' : ''}`}>
                    <Search size={20} strokeWidth={activeTab === 'SEARCH' ? 3 : 2.5} />
                </div>
                <span className="text-[10px] font-black tracking-wide">경로 탐색</span>
            </button>

            {/* <button 
                onClick={() => setActiveTab('OPEN_NOW')} 
                className={`flex flex-col items-center gap-0.5 p-2 rounded-2xl transition-all duration-300 w-16 group ${activeTab === 'OPEN_NOW' ? 'text-brandPink -translate-y-1' : 'text-gray-300 hover:text-gray-400'}`}
            >
                <div className={`p-1.5 rounded-full transition-all ${activeTab === 'OPEN_NOW' ? 'bg-pink-50 shadow-inner' : ''}`}>
                    <Store size={20} strokeWidth={activeTab === 'OPEN_NOW' ? 3 : 2.5} />
                </div>
                <span className="text-[10px] font-black tracking-wide">영업중</span>
            </button> */}

            <button 
                onClick={() => setActiveTab('HISTORY')} 
                className={`flex flex-col items-center gap-0.5 p-2 rounded-2xl transition-all duration-300 w-16 group ${activeTab === 'HISTORY' ? 'text-brandBlue -translate-y-1' : 'text-gray-300 hover:text-gray-400'}`}

            >
                <div className={`p-1.5 rounded-full transition-all ${activeTab === 'HISTORY' ? 'bg-blue-50 shadow-inner' : ''}`}>
                    <Bell size={20} strokeWidth={activeTab === 'HISTORY' ? 3 : 2.5} />
                </div>
                <span className="text-[10px] font-black tracking-wide">알림</span>
            </button>

            <button 
                onClick={() => setActiveTab('MY_PAGE')} 
                className={`flex flex-col items-center gap-0.5 p-2 rounded-2xl transition-all duration-300 w-16 group ${activeTab === 'MY_PAGE' ? 'text-brandBlue -translate-y-1' : 'text-gray-300 hover:text-gray-400'}`}
            >
                <div className={`p-1.5 rounded-full transition-all ${activeTab === 'MY_PAGE' ? 'bg-blue-50 shadow-inner' : ''}`}>
                    <User size={20} strokeWidth={activeTab === 'MY_PAGE' ? 3 : 2.5} />
                </div>
                <span className="text-[10px] font-black tracking-wide">내 정보</span>
            </button>
       </div>
    </div>
  );
};

export default App;