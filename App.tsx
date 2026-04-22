import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MapPin, Navigation, Bus, Train, ArrowRight, ChevronLeft, Search, Beer, Car, Clock, Sparkles, User, CreditCard, Home, Settings, Edit2, Bell, ToggleLeft, ToggleRight, Store, Star, X, Utensils, BellRing, Shield, TrendingUp, Phone, Footprints, ChevronRight, FileText, Plus, Coffee, Wine, Mail, Camera } from 'lucide-react';
import { getOdsayTransitRoutes } from './services/odsayService';
import { findLatestDeparture } from './services/latestDepartureService';
import { AppState, HybridRoute, LDTResult, Place } from './types';
import CostChart from './components/CostChart';
import Countdown from './components/Countdown';
import DaumPostcode from 'react-daum-postcode';
import RealTimeArrival from './components/RealTimeArrival';
import TmapRouteView from './components/TmapRouteView';

// 이벤트 트래킹 (fire-and-forget)
const track = (event: 'visit' | 'search' | 'signup' | 'taxi') => {
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
  }).catch(() => {});
};

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
  const [postcodeTarget, setPostcodeTarget] = useState<'start' | 'end' | 'home' | null>(null);
  
  // Notice Detail State
  const [selectedNotice, setSelectedNotice] = useState<any | null>(null);
  const [showMyPageNotices, setShowMyPageNotices] = useState(false);
  const [showCustomerService, setShowCustomerService] = useState(false);
  const [showTaxiSelector, setShowTaxiSelector] = useState(false);
  
  // LDT (오늘의 찐막차) State
  const [ldtResult, setLdtResult] = useState<LDTResult | null>(null);
  const [ldtLoading, setLdtLoading] = useState(false);
  const [ldtRoutes, setLdtRoutes] = useState<HybridRoute[] | null>(null);
  const [ldtRoutesLoading, setLdtRoutesLoading] = useState(false);

  // 필터 State
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterMaxTaxi, setFilterMaxTaxi] = useState<number>(99999);
  const [filterMaxWalk, setFilterMaxWalk] = useState<number>(99);
  const [filterMaxTransfer, setFilterMaxTransfer] = useState<number>(9);
  const [filterExcludeTaxi, setFilterExcludeTaxi] = useState<boolean>(false);
  const [filterDepartureTime, setFilterDepartureTime] = useState<string>('');
  const [isRefetchingRoutes, setIsRefetchingRoutes] = useState(false);
  const [filterModalType, setFilterModalType] = useState<'taxi' | 'walk' | null>(null);
  const [filterPickerTemp, setFilterPickerTemp] = useState<number>(99999);
  const pickerScrollRef = useRef<HTMLDivElement>(null);
  const [pendingFilters, setPendingFilters] = useState({
    departureTime: '',
    maxTaxi: 99999,
    maxWalk: 99,
    maxTransfer: 9,
    excludeTaxi: false,
  });

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
  
  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginProvider, setLoginProvider] = useState<string>('');
  const [showLoginOverlay, setShowLoginOverlay] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // User Settings State
  const [homeAddress, setHomeAddress] = useState('');
  const [isEditingHome, setIsEditingHome] = useState(false);
  const [tempHomeAddress, setTempHomeAddress] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  
  // Advanced My Page State
  const [nickname, setNickname] = useState('프로 막차러');
  const [tempNickname, setTempNickname] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [tempProfileImage, setTempProfileImage] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [emergencyPhone, setEmergencyPhone] = useState('010-xxxx-xxxx');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [tempPhone, setTempPhone] = useState('');
  const [walkPreference, setWalkPreference] = useState<'SHORT' | 'CHEAP'>('CHEAP');

  // 피커 모달 열릴 때 현재 선택값으로 스크롤
  useEffect(() => {
    if (!filterModalType || !pickerScrollRef.current) return;
    const options = filterModalType === 'taxi'
      ? [99999, 5000, 10000, 15000, 20000]
      : [99, 5, 10, 15, 20, 30];
    const idx = options.indexOf(filterPickerTemp);
    if (idx >= 0) {
      const el = pickerScrollRef.current.children[idx] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'nearest', inline: 'center' });
    }
  }, [filterModalType]);

  // Splash Screen Effect + 방문자 트래킹
  useEffect(() => {
    setSplashMessage(SPLASH_MESSAGES[Math.floor(Math.random() * SPLASH_MESSAGES.length)]);
    track('visit');

    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);

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
      const walkThreshold = filterMaxWalk < 99 ? filterMaxWalk : undefined;
      const routeData = await getOdsayTransitRoutes(startLoc, endLoc, undefined, walkThreshold);
      const { routes: fetchedRoutes, fullTaxiCost: fetchedCost } = routeData;

      if (fetchedRoutes.length === 0) {
          setError("경로를 못 찾겠어요... 😭 조금 더 정확히 알려주세요!");
          setAppState(AppState.HOME);
      } else {
          track('search');
          setRoutes(fetchedRoutes);
          setFullTaxiCost(fetchedCost);
          setNearbyPlaces(MOCK_PLACES);
          setAppState(AppState.RESULTS);

          // LDT 계산 — 백그라운드 비동기
          setLdtResult(null);
          setLdtRoutes(null);
          setLdtLoading(true);
          const firstWalkMinutes = fetchedRoutes[0]?.segments
              .filter(s => s.type === 'walk')
              .slice(0, 1)
              .reduce((acc, s) => acc + s.durationMinutes, 0) ?? 0;
          findLatestDeparture(startLoc, endLoc, firstWalkMinutes)
              .then(async result => {
                  setLdtResult(result);
                  if (result && result.latestDepartureMs) {
                      setLdtRoutesLoading(true);
                      try {
                          const ldtDate = new Date(result.latestDepartureMs);
                          const { routes: lr } = await getOdsayTransitRoutes(startLoc, endLoc, ldtDate);
                          setLdtRoutes(lr);
                      } catch { /* 실패해도 시각 표시는 유지 */ }
                      finally { setLdtRoutesLoading(false); }
                  }
              })
              .finally(() => setLdtLoading(false));
      }
    } catch (e) {
      console.error(e);
      setError("오류가 났어요... 다시 시도해주세요! 😵‍💫");
      setAppState(AppState.HOME);
    } finally {
      setIsLoading(false);
    }
  }, [startLoc, endLoc]);

  // 필터 패널 열릴 때 현재 적용값으로 pending 동기화
  useEffect(() => {
    if (filterOpen) {
      setPendingFilters({
        departureTime: filterDepartureTime,
        maxTaxi: filterMaxTaxi,
        maxWalk: filterMaxWalk,
        maxTransfer: filterMaxTransfer,
        excludeTaxi: filterExcludeTaxi,
      });
    }
  }, [filterOpen]);

  // 필터 적용 (패널 "적용" 버튼)
  const handleApplyFilters = useCallback(async () => {
    const needsRefetch = pendingFilters.departureTime !== filterDepartureTime
      || pendingFilters.maxWalk !== filterMaxWalk
      || pendingFilters.excludeTaxi !== filterExcludeTaxi;
    setFilterMaxTaxi(pendingFilters.maxTaxi);
    setFilterMaxWalk(pendingFilters.maxWalk);
    setFilterMaxTransfer(pendingFilters.maxTransfer);
    setFilterExcludeTaxi(pendingFilters.excludeTaxi);
    setFilterDepartureTime(pendingFilters.departureTime);
    setFilterOpen(false);

    if (needsRefetch && startLoc && endLoc) {
      setIsRefetchingRoutes(true);
      try {
        let depDate: Date | undefined;
        if (pendingFilters.departureTime) {
          const [h, m] = pendingFilters.departureTime.split(':').map(Number);
          depDate = new Date();
          depDate.setHours(h, m, 0, 0);
          if (depDate.getTime() < Date.now()) depDate.setDate(depDate.getDate() + 1);
        }
        const newWalkThreshold = pendingFilters.maxWalk < 99 ? pendingFilters.maxWalk : undefined;
        const { routes: r, fullTaxiCost: c } = await getOdsayTransitRoutes(startLoc, endLoc, depDate, newWalkThreshold, pendingFilters.excludeTaxi);
        if (r.length > 0) { setRoutes(r); setFullTaxiCost(c); }
        else { setError('해당 시각에 운행 중인 경로가 없습니다. 출발 시간을 변경해보세요.'); }
      } catch (e: any) {
        setError(e?.message || '해당 시각에 운행 중인 경로가 없습니다. 심야버스(N버스) 또는 택시를 이용해보세요.');
      }
      finally { setIsRefetchingRoutes(false); }
    }
  }, [pendingFilters, filterDepartureTime, startLoc, endLoc]);

  // 필터 적용된 경로 목록 (택시 제외는 서비스 레벨에서 이미 처리됨)
  const filteredRoutes = routes.filter((r: HybridRoute) => {
    if (!filterExcludeTaxi && r.taxiWalkCost > filterMaxTaxi) return false;
    const remainWalk = r.segments.filter((s: { type: string }) => s.type === 'walk').reduce((sum: number, s: { durationMinutes: number }) => sum + s.durationMinutes, 0);
    if (remainWalk > filterMaxWalk) return false;
    if (r.transferCount > filterMaxTransfer) return false;
    return true;
  });

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
      setIsNotiModalOpen(false);

      if (typeof minutes === 'string') return;

      const route = routes.find(r => r.id === activeRouteId);
      if (!route?.departureTime) {
          alert('막차 시간 정보를 찾을 수 없어요.');
          return;
      }

      const [h, m] = route.departureTime.split(':').map(Number);
      const now = new Date();
      const departure = new Date(now);
      departure.setHours(h, m, 0, 0);
      if (departure.getTime() <= now.getTime()) {
          departure.setDate(departure.getDate() + 1);
      }

      const notifAt = new Date(departure.getTime() - minutes * 60 * 1000);
      const msDelay = notifAt.getTime() - now.getTime();

      if (msDelay < 0) {
          alert(`이미 막차 ${minutes}분 이내예요! 🏃 지금 바로 출발하세요!`);
          return;
      }

      const scheduleNotif = () => {
          setTimeout(() => {
              new Notification('찐막차 알림 🚌', {
                  body: `출발 ${minutes}분 전이에요! 지금 출발하세요!`,
                  icon: '/favicon.ico',
                  tag: 'jjinmakcha-alert',
                  requireInteraction: true,
              });
          }, msDelay);
          const minLeft = Math.round(msDelay / 60000);
          alert(`출발 ${minutes}분 전(${minLeft}분 후)에 알림을 드릴게요! 🔔`);
      };

      if (!('Notification' in window)) {
          alert('이 브라우저는 알림을 지원하지 않아요.');
          return;
      }

      if (Notification.permission === 'granted') {
          scheduleNotif();
      } else if (Notification.permission === 'denied') {
          alert('알림이 차단되어 있어요. 브라우저 설정에서 알림을 허용해주세요.');
      } else {
          Notification.requestPermission().then(perm => {
              if (perm === 'granted') scheduleNotif();
              else alert('알림 권한을 허용해야 알림을 받을 수 있어요.');
          });
      }
  };

  const handleBack = () => {
      if (appState === AppState.DETAILS) setAppState(AppState.RESULTS);
      else if (appState === AppState.LDT_DETAIL) setAppState(AppState.RESULTS);
      else if (appState === AppState.RESULTS) setAppState(AppState.HOME);
      else if (appState === AppState.PLACE_DETAIL) {
          // If we came from Open Now Tab
          if (activeTab === 'OPEN_NOW') setSelectedPlace(null);
          // If we came from Search Results
          else setAppState(AppState.RESULTS);
      }
  };

  const handleSocialLogin = (provider: 'kakao' | 'naver' | 'google') => {
    const kakaoClientId  = import.meta.env.VITE_KAKAO_CLIENT_ID;
    const naverClientId  = import.meta.env.VITE_NAVER_CLIENT_ID;
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri    = encodeURIComponent(window.location.origin);

    if (provider === 'kakao' && kakaoClientId) {
      window.location.href = `https://kauth.kakao.com/oauth/authorize?client_id=${kakaoClientId}&redirect_uri=${redirectUri}&response_type=code`;
      return;
    }
    if (provider === 'naver' && naverClientId) {
      const state = Math.random().toString(36).slice(2);
      window.location.href = `https://nid.naver.com/oauth2.0/authorize?client_id=${naverClientId}&redirect_uri=${redirectUri}&response_type=code&state=${state}`;
      return;
    }
    if (provider === 'google' && googleClientId) {
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${redirectUri}&response_type=code&scope=email%20profile`;
      return;
    }
    // 클라이언트 ID 미설정 시 → 개발 목업 로그인
    track('signup');
    const names: Record<string, string> = { kakao: '카카오', naver: '네이버', google: '구글' };
    setLoginProvider(names[provider]);
    setIsLoggedIn(true);
    setShowLoginOverlay(false);
  };

  const requireLogin = (action: () => void) => {
    if (isLoggedIn) action();
    else setShowLoginPrompt(true);
  };

  const openTaxiApp = (app: 'kakao' | 'ut') => {
      track('taxi');
      setShowTaxiSelector(false);
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);

      const config = {
          kakao: {
              scheme: 'kakaot://',
              intentUrl: 'intent://taxi#Intent;scheme=kakaot;package=com.kakao.taxi;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.kakao.taxi;end',
              iosStore: 'https://apps.apple.com/kr/app/kakao-t/id981110422',
              web: 'https://t.kakao.com/',
          },
          ut: {
              scheme: 'ut://',
              intentUrl: 'intent://main#Intent;scheme=ut;package=com.skt.ut;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.skt.ut;end',
              iosStore: 'https://apps.apple.com/kr/app/ut/id1550366601',
              web: 'https://www.ut.cab/',
          },
      }[app];

      if (isAndroid) {
          window.location.href = config.intentUrl;
      } else if (isIOS) {
          window.location.href = config.scheme;
          setTimeout(() => { window.location.href = config.iosStore; }, 1500);
      } else {
          window.open(config.web, '_blank');
      }
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
      if (tempNickname.trim()) setNickname(tempNickname);
      if (tempProfileImage) setProfileImage(tempProfileImage);
      setIsEditingProfile(false);
  };

  const toggleNotifications = async () => {
      if (!notificationsEnabled) {
          if (!('Notification' in window)) {
              setNotificationsEnabled(true);
              return;
          }
          if (Notification.permission === 'granted') {
              setNotificationsEnabled(true);
          } else if (Notification.permission === 'denied') {
              alert('브라우저 알림이 차단되어 있어요. 브라우저 주소창 왼쪽 🔒 아이콘을 눌러 알림을 허용해주세요.');
          } else {
              const permission = await Notification.requestPermission();
              if (permission === 'granted') {
                  setNotificationsEnabled(true);
                  new Notification('찐막차 알림 🚌', {
                      body: '막차 알림이 켜졌어요! 막차 놓치지 않게 알려드릴게요.',
                      icon: '/favicon.ico',
                      tag: 'jjinmakcha-welcome',
                  });
              } else {
                  alert('알림 권한을 허용해야 알림을 받을 수 있어요.');
              }
          }
      } else {
          setNotificationsEnabled(false);
      }
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
    <div className="flex flex-col h-full px-6 pt-6 pb-6 bg-gradient-to-b from-blue-50 to-white overflow-y-auto">
      {/* 우측 상단 프로필 버튼 */}
      <div className="flex justify-end mb-2">
          <button
              onClick={() => requireLogin(() => setActiveTab('MY_PAGE'))}
              className="w-10 h-10 rounded-full bg-white border-2 border-gray-100 shadow-sm flex items-center justify-center overflow-hidden hover:scale-105 transition-transform active:scale-95"
          >
              {profileImage
                  ? <img src={profileImage} className="w-full h-full object-cover" alt="프로필" />
                  : <User size={20} className="text-gray-400" />}
          </button>
      </div>

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
                <button onClick={() => requireLogin(() => setPostcodeTarget('start'))} className="p-4 bg-gray-50 rounded-2xl text-gray-500 hover:bg-gray-100 transition-colors whitespace-nowrap font-bold text-sm shrink-0">
                    주소찾기
                </button>
                <button onClick={() => requireLogin(handleUseCurrentLocation)} className="p-4 bg-blue-50 rounded-2xl text-brandBlue hover:bg-blue-100 transition-colors shrink-0">
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
                <button onClick={() => requireLogin(() => setPostcodeTarget('end'))} className="p-4 bg-gray-50 rounded-2xl text-gray-500 hover:bg-gray-100 transition-colors whitespace-nowrap font-bold text-sm shrink-0">
                    주소찾기
                </button>
            </div>
          </div>

          <div className="pt-2">
             <button
                onClick={() => requireLogin(handleGoHome)}
                className={`w-full py-3 rounded-2xl text-sm mb-4 border-2 border-dashed transition-all font-bold flex items-center justify-center gap-2 ${homeAddress ? 'bg-blue-50 border-brandBlue text-brandBlue' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-500'}`}
             >
                <Home size={16} />
                {homeAddress ? `우리 집으로 슝~` : '우리 집 등록하고 편하게 가기!'}
             </button>

            <button
                onClick={() => requireLogin(handleSearch)}
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

      {postcodeTarget && postcodeTarget !== 'home' && (
        <div className="absolute inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 backdrop-blur-md">
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
                            if (postcodeTarget === 'home') setTempHomeAddress(data.address);
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
        <div className="flex flex-col h-full bg-gray-50">
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
      <div className="flex flex-col h-full bg-gray-50">
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
    <div className="flex flex-col h-full bg-gray-50 pb-6 relative">
        {/* Header */}
        <header className="px-5 py-4 bg-white sticky top-0 z-20 shadow-sm flex items-center gap-2">
            <button onClick={() => setActiveTab('SEARCH')} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
                <ChevronLeft size={24} />
            </button>
            <h2 className="text-xl font-black text-gray-800">내 정보</h2>
        </header>

        <div className="flex-1 overflow-y-auto">
            {/* Profile Hero */}
            <div className="bg-gradient-to-br from-brandBlue to-blue-500 px-5 py-8 relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-brandPink/20 rounded-full blur-2xl" />

                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center shrink-0 overflow-hidden">
                        {profileImage
                            ? <img src={profileImage} className="w-full h-full object-cover" alt="프로필" />
                            : <User size={32} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-2xl font-black text-white truncate">{nickname}</h3>
                            <span className="text-[10px] bg-brandYellow text-gray-800 font-black px-2 py-0.5 rounded-full shrink-0 shadow-sm">LV. 3</span>
                        </div>
                        <p className="text-blue-100 text-sm font-medium">서울 마스터 🏙️</p>
                    </div>
                    <button
                        onClick={() => { setIsEditingProfile(true); setTempNickname(nickname); setTempProfileImage(''); }}
                        className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur-md transition-colors shrink-0"
                    >
                        <Edit2 size={15} className="text-white" />
                    </button>
                </div>

                {/* 절약 현황 */}
                <div className="relative z-10 mt-5 bg-black/20 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                    <div className="flex justify-between items-end mb-2">
                        <div>
                            <p className="text-blue-100 text-[10px] font-bold mb-0.5">이번 달 절약 금액</p>
                            <p className="text-2xl font-black text-white">42,000원</p>
                        </div>
                        <div className="text-right">
                            <p className="text-blue-100 text-[10px] font-bold mb-0.5">목표까지 남은 금액</p>
                            <p className="text-brandYellow font-black text-sm">8,000원</p>
                        </div>
                    </div>
                    <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden mb-1.5">
                        <div className="bg-brandYellow h-full rounded-full w-[84%] shadow-[0_0_8px_rgba(255,217,61,0.5)] transition-all" />
                    </div>
                    <p className="text-blue-100 text-[10px] font-bold flex items-center gap-1">
                        <TrendingUp size={10} /> 목표: 치킨 먹기 🍗
                    </p>
                </div>
            </div>

            <div className="p-4 space-y-3">
                {/* 나의 설정 */}
                <div className="bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm">
                    <div className="px-5 pt-4 pb-2">
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide">나의 설정</p>
                    </div>

                    {/* 우리 집 */}
                    <button
                        onClick={() => { setIsEditingHome(true); setTempHomeAddress(homeAddress); }}
                        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors active:bg-gray-100"
                    >
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                            <Home size={18} className="text-brandBlue" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                            <p className="font-bold text-gray-800 text-sm">우리 집 주소</p>
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                                {homeAddress || '등록하면 한 번에 집으로! 🏠'}
                            </p>
                        </div>
                        <ChevronRight size={16} className="text-gray-300 shrink-0" />
                    </button>

                    <div className="mx-5 h-px bg-gray-50" />

                    {/* 이동 취향 */}
                    <button
                        onClick={() => setWalkPreference(walkPreference === 'CHEAP' ? 'SHORT' : 'CHEAP')}
                        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors active:bg-gray-100"
                    >
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${walkPreference === 'CHEAP' ? 'bg-brandMint/10' : 'bg-purple-50'}`}>
                            <Footprints size={18} className={walkPreference === 'CHEAP' ? 'text-brandMint' : 'text-purple-500'} />
                        </div>
                        <div className="flex-1 text-left">
                            <p className="font-bold text-gray-800 text-sm">이동 취향</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {walkPreference === 'CHEAP' ? '💸 비용 절약형' : '🚶 최소 도보형'}
                            </p>
                        </div>
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full shrink-0 ${walkPreference === 'CHEAP' ? 'bg-brandMint/10 text-brandMint' : 'bg-purple-50 text-purple-500'}`}>
                            탭으로 전환
                        </span>
                    </button>

                    <div className="mx-5 h-px bg-gray-50" />

                    {/* 안심 귀가 — 히든 */}
                    <div className="hidden">
                    <div className="mx-5 h-px bg-gray-50" />
                    <button
                        onClick={() => { setIsEditingPhone(true); setTempPhone(emergencyPhone === '010-xxxx-xxxx' ? '' : emergencyPhone); }}
                        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors active:bg-gray-100"
                    >
                        <div className="w-10 h-10 rounded-2xl bg-pink-50 flex items-center justify-center shrink-0">
                            <Shield size={18} className="text-brandPink" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                            <p className="font-bold text-gray-800 text-sm">안심 귀가</p>
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                                {emergencyPhone === '010-xxxx-xxxx' ? '비상 연락처를 등록해주세요' : emergencyPhone}
                            </p>
                        </div>
                        <ChevronRight size={16} className="text-gray-300 shrink-0" />
                    </button>
                    </div>
                    <div className="pb-2" />
                </div>

                {/* 알림 설정 */}
                <div className="bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm">
                    <div className="px-5 pt-4 pb-2">
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide">알림 설정</p>
                    </div>
                    <div
                        onClick={toggleNotifications}
                        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors active:bg-gray-100"
                    >
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${notificationsEnabled ? 'bg-brandYellow/15' : 'bg-gray-100'}`}>
                            {notificationsEnabled
                                ? <BellRing size={18} className="text-brandYellow" />
                                : <Bell size={18} className="text-gray-400" />}
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-gray-800 text-sm">막차 알림</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {notificationsEnabled ? '알림이 켜져 있어요' : '알림이 꺼져 있어요'}
                            </p>
                        </div>
                        <div className={`w-12 h-6 rounded-full p-1 transition-all flex items-center shrink-0 ${notificationsEnabled ? 'bg-brandYellow justify-end' : 'bg-gray-200 justify-start'}`}>
                            <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                        </div>
                    </div>
                    <div className="pb-2" />
                </div>

                {/* 앱 정보 */}
                <div className="bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm">
                    <div className="px-5 pt-4 pb-2">
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide">앱 정보</p>
                    </div>
                    {/* 공지사항 — 히든 */}
                    <div className="hidden">
                    <button onClick={() => setShowMyPageNotices(true)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors active:bg-gray-100">
                        <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0">
                            <FileText size={18} className="text-gray-400" />
                        </div>
                        <div className="flex-1 text-left">
                            <p className="font-bold text-gray-800 text-sm">공지사항</p>
                        </div>
                        <ChevronRight size={16} className="text-gray-300 shrink-0" />
                    </button>
                    <div className="mx-5 h-px bg-gray-50" />
                    </div>
                    <button onClick={() => setShowCustomerService(true)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors active:bg-gray-100">
                        <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0">
                            <Phone size={18} className="text-gray-400" />
                        </div>
                        <div className="flex-1 text-left">
                            <p className="font-bold text-gray-800 text-sm">고객센터</p>
                        </div>
                        <ChevronRight size={16} className="text-gray-300 shrink-0" />
                    </button>
                    <div className="pb-2" />
                </div>

                {/* 로그아웃 */}
                <button
                    onClick={() => { setIsLoggedIn(false); setLoginProvider(''); }}
                    className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-500 font-black text-sm hover:bg-gray-200 transition-colors active:scale-[0.98]"
                >
                    로그아웃
                    {loginProvider ? ` (${loginProvider})` : ''}
                </button>

                {/* 버전 */}
                <div className="text-center py-4">
                    <p className="text-xs text-gray-400 font-bold">찐막차 v2.1.0</p>
                    <p className="text-[10px] text-gray-300 mt-0.5">Designed for Safe & Fun Nightlife 🌙</p>
                </div>
            </div>
        </div>

        {/* 공지사항 상세 페이지 */}
        {showMyPageNotices && (
            <div className="absolute inset-0 z-[60] bg-gray-50 flex flex-col animate-in slide-in-from-right-full duration-300">
                <header className="px-5 py-4 bg-white sticky top-0 z-20 shadow-sm flex items-center gap-2">
                    <button onClick={() => { setShowMyPageNotices(false); setSelectedNotice(null); }} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
                        <ChevronLeft size={24} />
                    </button>
                    <h2 className="text-xl font-black text-gray-800">공지사항</h2>
                </header>
                {selectedNotice ? (
                    <div className="flex-1 overflow-y-auto p-6">
                        <button onClick={() => setSelectedNotice(null)} className="flex items-center gap-1 text-gray-400 text-sm font-bold mb-5 hover:text-gray-600">
                            <ChevronLeft size={16} /> 목록으로
                        </button>
                        <div className="mb-4">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="bg-brandPink/10 text-brandPink text-xs font-bold px-2 py-1 rounded-md">공지</span>
                                <span className="text-sm text-gray-400 font-medium">{selectedNotice.date}</span>
                            </div>
                            <h1 className="text-2xl font-black text-gray-800 leading-tight">{selectedNotice.title}</h1>
                        </div>
                        <div className="w-full h-px bg-gray-100 mb-6" />
                        <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{selectedNotice.content}</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {historyData.filter(item => item.type === 'alert').map((item, index) => (
                            <div
                                key={index}
                                onClick={() => setSelectedNotice(item)}
                                className="bg-white rounded-2xl px-5 py-4 border border-gray-100 shadow-sm cursor-pointer hover:bg-gray-50 active:scale-[0.98] transition-all flex items-start gap-4"
                            >
                                <div className="w-10 h-10 rounded-2xl bg-brandPink/10 flex items-center justify-center shrink-0">
                                    <Bell size={18} className="text-brandPink" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-black text-gray-800 text-sm leading-snug">{item.title}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                                    <p className="text-[11px] text-gray-300 mt-1 font-medium">{item.date}</p>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 shrink-0 mt-1" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* 고객센터 상세 페이지 */}
        {showCustomerService && (
            <div className="absolute inset-0 z-[60] bg-gray-50 flex flex-col animate-in slide-in-from-right-full duration-300">
                <header className="px-5 py-4 bg-white sticky top-0 z-20 shadow-sm flex items-center gap-2">
                    <button onClick={() => setShowCustomerService(false)} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
                        <ChevronLeft size={24} />
                    </button>
                    <h2 className="text-xl font-black text-gray-800">고객센터</h2>
                </header>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 pt-5 pb-3">
                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide mb-4">문의 연락처</p>
                            <a href="mailto:ksw@onion.co.kr" className="flex items-center gap-4 py-3 hover:bg-gray-50 rounded-2xl px-1 transition-colors active:scale-[0.98]">
                                <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                                    <Mail size={18} className="text-brandBlue" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[11px] text-gray-400 font-bold">이메일</p>
                                    <p className="text-sm font-black text-gray-800">ksw@onion.co.kr</p>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 shrink-0" />
                            </a>
                            <div className="mx-1 h-px bg-gray-50 my-1" />
                            <a href="tel:032-324-9817" className="flex items-center gap-4 py-3 hover:bg-gray-50 rounded-2xl px-1 transition-colors active:scale-[0.98]">
                                <div className="w-10 h-10 rounded-2xl bg-green-50 flex items-center justify-center shrink-0">
                                    <Phone size={18} className="text-green-500" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[11px] text-gray-400 font-bold">전화</p>
                                    <p className="text-sm font-black text-gray-800">032-324-9817</p>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 shrink-0" />
                            </a>
                        </div>
                        <div className="px-5 pb-5">
                            <div className="bg-blue-50 rounded-2xl px-4 py-3 mt-2">
                                <p className="text-xs text-brandBlue font-bold">운영 시간</p>
                                <p className="text-xs text-blue-600 font-medium mt-0.5">평일 09:00 ~ 18:00 (주말·공휴일 휴무)</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* 닉네임 편집 모달 */}
        {isEditingProfile && (
            <div className="absolute inset-0 z-[60] bg-black/60 flex items-end backdrop-blur-sm">
                <div className="bg-white w-full rounded-t-[2rem] p-6 shadow-2xl">
                    <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
                    <p className="text-lg font-black text-gray-800 mb-5">프로필 편집</p>

                    {/* 프로필 사진 */}
                    <div className="flex flex-col items-center mb-6">
                        <div className="relative">
                            <div className="w-20 h-20 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center overflow-hidden">
                                {tempProfileImage
                                    ? <img src={tempProfileImage} className="w-full h-full object-cover" alt="미리보기" />
                                    : profileImage
                                        ? <img src={profileImage} className="w-full h-full object-cover" alt="프로필" />
                                        : <User size={36} className="text-gray-400" />}
                            </div>
                            <label className="absolute bottom-0 right-0 w-7 h-7 bg-brandBlue rounded-full flex items-center justify-center cursor-pointer shadow-md hover:bg-blue-600 transition-colors">
                                <Camera size={14} className="text-white" />
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const reader = new FileReader();
                                        reader.onload = (ev) => setTempProfileImage(ev.target?.result as string);
                                        reader.readAsDataURL(file);
                                    }}
                                />
                            </label>
                        </div>
                        <p className="text-xs text-gray-400 mt-2 font-medium">사진을 눌러 변경하세요</p>
                    </div>

                    {/* 닉네임 */}
                    <p className="text-xs font-black text-gray-400 mb-2 uppercase tracking-wide">닉네임</p>
                    <input
                        type="text"
                        value={tempNickname}
                        onChange={(e) => setTempNickname(e.target.value)}
                        placeholder="새 닉네임 (최대 10자)"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-brandBlue rounded-2xl px-5 py-4 mb-5 focus:outline-none font-bold text-gray-800"
                        maxLength={10}
                    />
                    <div className="flex gap-3">
                        <button onClick={() => setIsEditingProfile(false)} className="flex-1 py-4 text-gray-500 bg-gray-100 rounded-2xl font-bold">취소</button>
                        <button onClick={saveNickname} className="flex-1 py-4 text-white bg-brandBlue rounded-2xl font-black shadow-md shadow-blue-200">저장</button>
                    </div>
                </div>
            </div>
        )}

        {/* 집 주소 편집 모달 */}
        {isEditingHome && (
            <div className="absolute inset-0 z-[60] bg-black/60 flex items-end backdrop-blur-sm">
                <div className="bg-white w-full rounded-t-[2rem] p-6 shadow-2xl">
                    <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
                    <p className="text-lg font-black text-gray-800 mb-1">우리 집 주소</p>
                    <p className="text-sm text-gray-400 mb-4">등록하면 도착지로 바로 설정할 수 있어요 🏠</p>
                    <div className="relative mb-4">
                        <input
                            type="text"
                            value={tempHomeAddress}
                            onChange={(e) => setTempHomeAddress(e.target.value)}
                            placeholder="예: 서울 강남구 강남대로 123"
                            className="w-full bg-gray-50 border-2 border-transparent focus:border-brandBlue rounded-2xl px-5 py-4 pr-[7.5rem] focus:outline-none font-bold"
                        />
                        <button
                            onClick={() => setPostcodeTarget('home')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-brandBlue text-white text-xs font-black px-3 py-2 rounded-xl shadow-sm active:scale-95 transition-transform"
                        >
                            <Search size={13} />
                            주소 검색
                        </button>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setIsEditingHome(false)} className="flex-1 py-4 text-gray-500 bg-gray-100 rounded-2xl font-bold">취소</button>
                        <button onClick={saveHomeAddress} className="flex-1 py-4 text-white bg-brandBlue rounded-2xl font-black shadow-md shadow-blue-200">저장</button>
                    </div>
                </div>
            </div>
        )}

        {/* 비상 연락처 편집 모달 */}
        {isEditingPhone && (
            <div className="absolute inset-0 z-[60] bg-black/60 flex items-end backdrop-blur-sm">
                <div className="bg-white w-full rounded-t-[2rem] p-6 shadow-2xl">
                    <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
                    <p className="text-lg font-black text-gray-800 mb-1">안심 귀가 연락처</p>
                    <p className="text-sm text-gray-400 mb-4">귀가 완료 시 보호자에게 알림을 보낼 수 있어요 🛡️</p>
                    <input
                        type="tel"
                        value={tempPhone}
                        onChange={(e) => setTempPhone(e.target.value)}
                        placeholder="010-0000-0000"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-brandPink rounded-2xl px-5 py-4 mb-4 focus:outline-none font-bold"
                        autoFocus
                    />
                    <div className="flex gap-3">
                        <button onClick={() => setIsEditingPhone(false)} className="flex-1 py-4 text-gray-500 bg-gray-100 rounded-2xl font-bold">취소</button>
                        <button onClick={saveEmergencyPhone} className="flex-1 py-4 text-white bg-brandPink rounded-2xl font-black shadow-md shadow-red-200">저장</button>
                    </div>
                </div>
            </div>
        )}

        {/* 주소 검색 팝업 (MY_PAGE) */}
        {postcodeTarget === 'home' && (
            <div className="absolute inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 backdrop-blur-md">
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
                                setTempHomeAddress(data.address);
                                setPostcodeTarget(null);
                                setIsEditingHome(true);
                            }}
                            autoClose={false}
                        />
                    </div>
                </div>
            </div>
        )}
    </div>
  );

  const renderLogin = () => (
    <div className="flex flex-col h-full px-6 pt-10 pb-8 bg-gradient-to-b from-blue-50 to-white overflow-y-auto">

      {/* 로고 영역 — 메인 화면과 동일한 구조 */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <div className="relative w-28 h-28 animate-float">
              <div className="absolute inset-0 bg-brandBlue/30 rounded-full blur-2xl" />
              <div className="relative w-full h-full rounded-full border-8 border-white flex items-center justify-center bg-brandBlue shadow-2xl">
                <Beer className="w-12 h-12 text-white transform -rotate-12" />
                <div className="absolute top-0 right-0 bg-brandPink text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg transform rotate-12">
                  막차 구조대
                </div>
              </div>
            </div>
          </div>
          <h1 className="text-5xl font-black tracking-tight text-gray-800 drop-shadow-sm">
            찐<span className="text-brandBlue">막차</span>
          </h1>
          <p className="text-gray-500 font-medium mt-3 bg-white px-5 py-2 rounded-full inline-block shadow-sm border border-gray-100">
            택시비 아껴서 <span className="text-brandPink font-bold">3차</span> 가자! 🍻
          </p>
        </div>

        {/* 로그인 카드 — 메인 화면 입력 카드와 동일한 스타일 */}
        <div className="w-full bg-white p-7 rounded-[2rem] border border-gray-100 shadow-xl space-y-3">
          <p className="text-center text-sm font-black text-gray-400 mb-4 uppercase tracking-widest">간편 로그인 / 회원가입</p>

          {/* 카카오 */}
          <button
            onClick={() => handleSocialLogin('kakao')}
            className="w-full flex items-center gap-3 bg-[#FEE500] rounded-2xl px-5 py-4 font-black text-gray-900 active:scale-[0.98] transition-all shadow-md shadow-yellow-100 hover:brightness-95"
          >
            <div className="w-8 h-8 rounded-xl bg-black/10 flex items-center justify-center shrink-0 text-sm font-black">K</div>
            <span className="flex-1 text-center text-[15px]">카카오로 시작하기</span>
          </button>

          {/* 네이버 */}
          <button
            onClick={() => handleSocialLogin('naver')}
            className="w-full flex items-center gap-3 bg-[#03C75A] rounded-2xl px-5 py-4 font-black text-white active:scale-[0.98] transition-all shadow-md shadow-green-100 hover:brightness-95"
          >
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 text-sm font-black">N</div>
            <span className="flex-1 text-center text-[15px]">네이버로 시작하기</span>
          </button>

          {/* 구글 */}
          <button
            onClick={() => handleSocialLogin('google')}
            className="w-full flex items-center gap-3 bg-white border-2 border-gray-100 rounded-2xl px-5 py-4 font-black text-gray-700 active:scale-[0.98] transition-all shadow-md hover:bg-gray-50"
          >
            <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
              <svg width="17" height="17" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            </div>
            <span className="flex-1 text-center text-[15px]">구글로 시작하기</span>
          </button>
        </div>
      </div>

      <p className="text-center text-[11px] text-gray-300 font-medium mt-6 leading-relaxed">
        가입 시 이용약관 및 개인정보처리방침에 동의하게 됩니다.
      </p>
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
    <div className="flex flex-col h-full bg-gray-50">
        {/* Header: 출발지 → 도착지 + 필터 버튼 */}
        <header className="px-4 py-3 flex items-center gap-2 bg-white/90 backdrop-blur-md sticky top-0 z-20 shadow-sm">
            <button onClick={handleBack} className="p-2 -ml-1 text-gray-400 hover:text-gray-800 rounded-full hover:bg-gray-100 transition-colors shrink-0">
                <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide flex items-center gap-1">
                    <span className="bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full text-[9px] font-black">🚕 하이브리드 추천 중</span>
                </p>
                <h2 className="text-sm font-black text-gray-800 truncate flex items-center gap-1">
                    <span className="truncate max-w-[100px]">{startLoc}</span>
                    <ArrowRight size={11} className="shrink-0 text-gray-400" />
                    <span className="truncate max-w-[100px]">{endLoc}</span>
                </h2>
            </div>
            <button
                onClick={() => setFilterOpen((v: boolean) => !v)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-colors ${filterOpen || filterMaxTaxi < 99999 || filterMaxWalk < 99 || filterMaxTransfer < 9 || filterDepartureTime || filterExcludeTaxi ? 'bg-brandBlue text-white' : 'bg-gray-100 text-gray-600'}`}
            >
                <Settings size={13} />
                필터{(filterMaxTaxi < 99999 || filterMaxWalk < 99 || filterMaxTransfer < 9 || filterDepartureTime || filterExcludeTaxi) ? ' ●' : ''}
            </button>
        </header>

        {/* 필터 패널 */}
        {filterOpen && (
            <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 space-y-3 shadow-sm">
                {/* 출발 시간 */}
                <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-600">출발 시간</span>
                    <div className="flex items-center gap-2">
                        <input
                            type="time"
                            value={pendingFilters.departureTime}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setPendingFilters({ ...pendingFilters, departureTime: e.target.value })}
                            className="text-xs font-bold text-gray-800 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brandBlue"
                        />
                        {pendingFilters.departureTime && (
                            <button onClick={() => setPendingFilters({ ...pendingFilters, departureTime: '' })} className="text-gray-400 hover:text-gray-600">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>
                {/* 최대 택시비 */}
                <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-600">최대 택시비</span>
                    <button
                        onClick={() => { setFilterPickerTemp(pendingFilters.maxTaxi); setFilterModalType('taxi'); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-xs font-black text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                        {pendingFilters.maxTaxi >= 99999 ? '제한없음' : `${pendingFilters.maxTaxi.toLocaleString()}원 이하`}
                        <ChevronRight size={12} className="text-gray-400" />
                    </button>
                </div>
                {/* 최대 도보 시간 */}
                <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-600">최대 도보</span>
                    <button
                        onClick={() => { setFilterPickerTemp(pendingFilters.maxWalk); setFilterModalType('walk'); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-xs font-black text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                        {pendingFilters.maxWalk >= 99 ? '제한없음' : `${pendingFilters.maxWalk}분 이하`}
                        <ChevronRight size={12} className="text-gray-400" />
                    </button>
                </div>
                {/* 최대 환승 횟수 */}
                <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-600">최대 환승</span>
                    <div className="flex gap-1.5">
                        {[9, 0, 1, 2, 3].map(v => (
                            <button key={v}
                                onClick={() => setPendingFilters({ ...pendingFilters, maxTransfer: v })}
                                className={`text-[11px] font-black px-2.5 py-1 rounded-full transition-colors ${pendingFilters.maxTransfer === v ? 'bg-brandBlue text-white' : 'bg-gray-100 text-gray-600'}`}>
                                {v === 9 ? '전체' : v === 0 ? '직통' : `${v}회`}
                            </button>
                        ))}
                    </div>
                </div>
                {/* 택시 제외 */}
                <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-600">택시 제외</span>
                    <button
                        onClick={() => setPendingFilters({ ...pendingFilters, excludeTaxi: !pendingFilters.excludeTaxi })}
                        className={`relative w-11 h-6 rounded-full transition-colors ${pendingFilters.excludeTaxi ? 'bg-brandBlue' : 'bg-gray-200'}`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${pendingFilters.excludeTaxi ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
                {/* 초기화 / 적용 버튼 */}
                <div className="flex gap-2 pt-1">
                    <button
                        onClick={() => setPendingFilters({ departureTime: '', maxTaxi: 99999, maxWalk: 99, maxTransfer: 9, excludeTaxi: false })}
                        className="flex-1 py-2.5 rounded-2xl bg-gray-100 text-gray-500 font-black text-sm"
                    >초기화</button>
                    <button
                        onClick={handleApplyFilters}
                        disabled={isRefetchingRoutes}
                        className="flex-2 px-6 py-2.5 rounded-2xl bg-brandBlue text-white font-black text-sm shadow-md shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                        {isRefetchingRoutes
                            ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />경로 탐색 중</>
                            : '적용'}
                    </button>
                </div>
            </div>
        )}

        {/* 재조회 오류 배너 */}
        {error && appState === AppState.RESULTS && (
            <div className="mx-4 mt-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-start gap-2">
                <span className="text-red-400 shrink-0 mt-0.5">⚠️</span>
                <div className="flex-1 min-w-0">
                    <p className="text-red-600 text-xs font-black">{error}</p>
                </div>
                <button onClick={() => setError('')} className="text-red-300 hover:text-red-400 shrink-0">
                    <X size={14} />
                </button>
            </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 낮 시간대 안내 배너 (06:00~18:00) */}
            {(() => {
                const h = new Date().getHours();
                return h >= 6 && h < 18;
            })() && (
                <div className="bg-amber-200 border border-amber-300 rounded-3xl px-4 py-3.5 flex items-start gap-3">
                    <span className="text-xl shrink-0">☀️</span>
                    <div>
                        <p className="text-gray-900 text-sm font-black leading-snug">
                            지금 택시 타면 아깝잖아요! 그 돈 아껴서 밤에 한 잔 더 하세요.
                        </p>
                        <p className="text-gray-800 text-sm font-black mt-0.5 leading-snug">
                            낮에는 지하철/버스가 정답입니다.
                        </p>
                        <p className="text-gray-900 text-xs font-medium mt-0.5">(아직은 다른 지도 앱이 더 유능해요... 소곤소곤)</p>
                    </div>
                </div>
            )}

            {/* 오늘의 찐막차 배너 — 히든 처리 */}
            <div className="hidden">
            <div
                onClick={() => ldtResult && setAppState(AppState.LDT_DETAIL)}
                className={`rounded-3xl overflow-hidden shadow-lg relative cursor-pointer active:scale-[0.98] transition-transform ${ldtResult?.routeExistsNow === false ? 'bg-gray-800' : 'bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]'}`}
            >
                <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 80% 20%, #f72585 0%, transparent 60%)' }} />
                <div className="relative p-5">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-black text-white/60 uppercase tracking-widest">오늘의 찐막차</span>
                        {ldtResult && <ChevronRight size={16} className="text-white/40" />}
                    </div>
                    {ldtLoading && !ldtResult ? (
                        <div className="flex items-center gap-3 py-2">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span className="text-white/60 text-sm font-bold">막차 시각 계산 중...</span>
                        </div>
                    ) : ldtResult?.routeExistsNow === false ? (
                        <div>
                            <p className="text-2xl font-black text-white mb-1">지금은 귀가 경로 없음</p>
                            <p className="text-white/50 text-xs font-bold">택시 이용을 고려해보세요</p>
                        </div>
                    ) : ldtResult ? (
                        <div>
                            <p className="text-5xl font-black text-white tracking-tight mb-1">{ldtResult.latestDepartureTime}</p>
                            <p className="text-white/60 text-xs font-bold mb-1">
                                {ldtResult.reachedSearchLimit
                                    ? '심야버스 운행 중 · 새벽 04시까지 귀가 가능'
                                    : '대중교통+택시로 귀가 가능한 마지막 출발 시각'}
                            </p>
                            <p className="text-white/40 text-xs font-bold">
                                {ldtResult.remainingMinutes > 0
                                    ? `지금부터 ${ldtResult.remainingMinutes >= 60 ? `${Math.floor(ldtResult.remainingMinutes / 60)}시간 ${ldtResult.remainingMinutes % 60}분` : `${ldtResult.remainingMinutes}분`} 남음`
                                    : '막차 시각이 지났어요'}
                            </p>
                            {ldtResult.hybridBonus && ldtResult.hybridBonus > 0 && (
                                <div className="mt-3 bg-white/10 rounded-2xl px-3 py-2 flex items-center gap-2">
                                    <Car size={13} className="text-yellow-300 shrink-0" />
                                    <span className="text-yellow-300 text-xs font-black">
                                        택시 첫 구간 이용 시 +{ldtResult.hybridBonus}분 더 가능
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-white/40 text-sm font-bold py-2">검색 후 표시됩니다</p>
                    )}
                </div>
            </div>
            </div>{/* 오늘의 찐막차 히든 끝 */}

            {filteredRoutes.length === 0 && routes.length > 0 && (
                <div className="bg-white rounded-2xl p-5 text-center shadow-sm border border-gray-100">
                    <p className="text-gray-500 font-bold text-sm">필터 조건에 맞는 경로가 없어요</p>
                    <button onClick={() => { setFilterMaxTaxi(99999); setFilterMaxWalk(99); setFilterMaxTransfer(9); setFilterExcludeTaxi(false); }} className="mt-2 text-brandBlue text-xs font-black">필터 초기화</button>
                </div>
            )}
            {filteredRoutes.map((route: HybridRoute, index: number) => {
                const { timeText, comment, urgent } = calculatePlayTime(route.departureTime, index);
                const arrDate = new Date(Date.now() + route.totalDuration * 60000);
                const arrH = arrDate.getHours();
                const arrM = arrDate.getMinutes();
                const arrStr = `${arrH < 12 ? '오전' : '오후'} ${arrH === 0 ? 12 : arrH > 12 ? arrH - 12 : arrH}:${arrM.toString().padStart(2, '0')}`;
                const durStr = route.totalDuration >= 60
                    ? `${Math.floor(route.totalDuration / 60)}시간 ${route.totalDuration % 60 > 0 ? `${route.totalDuration % 60}분` : ''}`
                    : `${route.totalDuration}분`;

                const accentColors = ['#3B82F6', '#06D6A0', '#8B5CF6'];
                const accent = accentColors[index] || '#3B82F6';

                return (
                    <div
                        key={route.id}
                        onClick={() => handleSelectRoute(route)}
                        className="bg-white rounded-[2rem] overflow-hidden border-l-4 border border-gray-100 cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all relative"
                        style={{ borderLeftColor: accent }}
                    >
                        <div className="p-5">
                            {/* 카드 헤더: 배지 + 벨 */}
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                        className="text-white text-[11px] font-black px-3 py-1 rounded-full shadow-sm"
                                        style={{ backgroundColor: accent }}
                                    >
                                        {route.routeLabel ?? `추천 ${index + 1}`}
                                    </span>
                                    {route.timeSavedByTaxi != null && route.timeSavedByTaxi > 0 && (
                                        <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-orange-100 text-orange-500 border border-orange-200">
                                            🚕 {route.timeSavedByTaxi}분 단축
                                        </span>
                                    )}
                                    <span className="text-xs font-bold text-gray-400">
                                        🚏 {route.transferPoint}
                                    </span>
                                </div>
                                <button
                                    onClick={(e) => handleOpenNotificationModal(e, route.id)}
                                    className="p-2 bg-gray-50 text-gray-400 hover:bg-brandBlue hover:text-white rounded-full transition-colors active:scale-95"
                                >
                                    <BellRing size={18} />
                                </button>
                            </div>

                            {/* 시간 + 도착 */}
                            <div className="flex items-end justify-between mb-3">
                                <div>
                                    <p className="text-[10px] text-gray-400 font-bold mb-0.5">총 소요시간</p>
                                    <p className="text-3xl font-black text-gray-900">{durStr}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-gray-400 font-bold mb-0.5">도착 예정</p>
                                    <p className="text-lg font-black text-gray-700">{arrStr}</p>
                                </div>
                            </div>

                            {/* 비용 */}
                            <div className="flex flex-wrap items-center gap-2 mb-4">
                                <span className="text-base font-black text-gray-800">{route.hybridTotalCost.toLocaleString()}원</span>
                                {route.taxiWalkCost > 0 && (
                                    <span className="bg-orange-50 text-orange-500 text-xs font-black px-2.5 py-1 rounded-full border border-orange-200">
                                        🚕 택시 {route.taxiWalkCost.toLocaleString()}원 포함
                                    </span>
                                )}
                                <span className="bg-brandMint/10 text-brandMint text-xs font-black px-2.5 py-1 rounded-full border border-brandMint/20">
                                    택시 대비 -{route.savedAmount.toLocaleString()}원
                                </span>
                            </div>

                            {/* 택시 탑승 명분 메시지 */}
                            {route.taxiJustification && (
                                <div className={`rounded-xl px-3.5 py-2.5 mb-4 flex items-start gap-2 ${route.timeMode === 'night' ? 'bg-indigo-50 border border-indigo-100' : 'bg-amber-50 border border-amber-100'}`}>
                                    <span className="text-base shrink-0 mt-0.5">{route.timeMode === 'night' ? '🌙' : '💡'}</span>
                                    <p className={`text-xs font-bold leading-relaxed ${route.timeMode === 'night' ? 'text-indigo-700' : 'text-amber-700'}`}>
                                        {route.taxiJustification}
                                    </p>
                                </div>
                            )}

                            {/* 수단별 소요시간 바 */}
                            <div className="flex items-stretch rounded-xl overflow-hidden gap-px mb-4">
                                {route.segments.map((seg, idx) => {
                                    const isSubway = seg.type === 'subway';
                                    const isBus = seg.type === 'bus';
                                    const isTaxi = seg.type === 'taxi';
                                    const icon = isSubway ? '🚇' : isBus ? '🚌' : isTaxi ? '🚕' : '🚶';
                                    const showLabel = seg.durationMinutes >= 4;
                                    const isWalk = seg.type === 'walk';

                                    const getSubwayColorLocal = (name: string): string => {
                                        const n = name || '';
                                        if (n.includes('1호선')) return '#0052A4';
                                        if (n.includes('2호선')) return '#00A84D';
                                        if (n.includes('3호선')) return '#EF7C1C';
                                        if (n.includes('4호선')) return '#00A4E3';
                                        if (n.includes('5호선')) return '#996CAC';
                                        if (n.includes('6호선')) return '#CD7C2F';
                                        if (n.includes('7호선')) return '#747F00';
                                        if (n.includes('8호선')) return '#E6186C';
                                        if (n.includes('9호선')) return '#BDB092';
                                        if (n.includes('신분당')) return '#D31145';
                                        if (n.includes('분당') || n.includes('수인')) return '#F5A200';
                                        if (n.includes('경의') || n.includes('중앙')) return '#77C4A3';
                                        if (n.includes('경춘')) return '#0C8E72';
                                        if (n.includes('경강') || n.includes('공항')) return '#0065B3';
                                        if (n.includes('GTX')) return '#9C4EA8';
                                        if (n.includes('용인')) return '#74C043';
                                        if (n.includes('의정부')) return '#C9AB8B';
                                        if (n.includes('인천1')) return '#7CA8D5';
                                        if (n.includes('인천2')) return '#F5A200';
                                        if (n.includes('우이')) return '#B0CE18';
                                        if (n.includes('서해')) return '#8FC31F';
                                        return '#6B7280';
                                    };

                                    if (isSubway) console.log('subway lineName:', seg.lineName);
                                    const bgColor = isSubway
                                        ? getSubwayColorLocal(seg.lineName || '')
                                        : isBus ? '#3B82F6' : isTaxi ? '#F97316' : '#D1D5DB';
                                    const textColor = isWalk ? '#6B7280' : '#ffffff';

                                    return (
                                        <div
                                            key={idx}
                                            className="flex flex-row items-center justify-start gap-0.5 px-1.5 py-2 min-w-0 overflow-hidden"
                                            style={{ flex: Math.max(seg.durationMinutes, 3), backgroundColor: bgColor }}
                                        >
                                            <span className="text-xs leading-none shrink-0">{icon}</span>
                                            {showLabel && (
                                                <span className="text-[10px] font-black whitespace-nowrap overflow-hidden" style={{ color: textColor }}>
                                                    {seg.durationMinutes}분
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* 긴박도 배너 */}
                            <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 mb-4 ${urgent ? 'bg-red-50' : 'bg-blue-50'}`}>
                                <Clock className={`w-4 h-4 shrink-0 ${urgent ? 'text-red-500 animate-pulse' : 'text-brandBlue'}`} />
                                <div className="min-w-0">
                                    <p className="text-[11px] text-gray-500 font-bold">
                                        막차까지 <span className={`font-black ${urgent ? 'text-red-500' : 'text-gray-800'}`}>{timeText}</span> 남음
                                    </p>
                                    <p className={`text-sm font-black truncate ${urgent ? 'text-red-500' : 'text-brandBlue'}`}>
                                        "{comment}"
                                    </p>
                                </div>
                            </div>

                            {/* 막차 카운트다운 */}
                            <div className="border-t border-gray-100 pt-4">
                                <p className="text-[10px] text-gray-400 font-bold mb-1">막차 출발까지</p>
                                <Countdown targetTimeStr={route.departureTime} />
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* 근처 장소 */}
            {nearbyPlaces.length > 0 && (
                <div className="pt-2">
                    <div className="flex items-center gap-2 mb-3">
                        <Beer className="text-brandYellow fill-brandYellow" size={20} />
                        <h3 className="text-lg font-black text-gray-800">아쉬우면 한잔 더? 🍻</h3>
                    </div>
                    <div className="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 snap-x hide-scrollbar">
                        {nearbyPlaces.slice(0, 3).map((place) => (
                            <div
                                key={place.id}
                                onClick={() => { setSelectedPlace(place); }}
                                className="min-w-[180px] w-[180px] bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm snap-center active:scale-95 transition-transform"
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
                                    <h4 className="font-bold text-gray-800 text-sm truncate mb-0.5">{place.name}</h4>
                                    <p className="text-[10px] text-gray-400 line-clamp-1">{place.address}</p>
                                </div>
                            </div>
                        ))}
                        <div
                            onClick={() => setActiveTab('OPEN_NOW')}
                            className="min-w-[80px] flex flex-col items-center justify-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 font-bold gap-2 cursor-pointer hover:bg-gray-100 transition-colors"
                        >
                            <div className="p-2 bg-white rounded-full shadow-sm">
                                <ArrowRight size={18} />
                            </div>
                            <span className="text-xs">더보기</span>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {isNotiModalOpen && (
            <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 animate-float shadow-2xl relative">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-2xl font-black text-gray-800">몇 분 전에 알려드릴까요? ⏰</h3>
                            <p className="text-gray-400 text-sm font-bold">경로 출발 시간 기준으로 알려드려요!</p>
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
                            ⚠️ 경로 출발 시간 기준 알림입니다.
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

        {/* 필터 슬라이더 모달 */}
        {filterModalType && (() => {
            const isTaxi = filterModalType === 'taxi';
            const max = isTaxi ? 100000 : 60;
            const step = isTaxi ? 1000 : 1;
            const isUnlimited = isTaxi ? filterPickerTemp >= 100000 : filterPickerTemp >= 60;
            const displayValue = isUnlimited
                ? '제한없음'
                : isTaxi
                    ? `${filterPickerTemp.toLocaleString()}원`
                    : `${filterPickerTemp}분`;
            return (
                <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center px-6"
                    onClick={() => setFilterModalType(null)}>
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-gray-900 text-center mb-1">
                            {isTaxi ? '최대 택시비' : '최대 도보 시간'}
                        </h3>
                        {/* 현재 값 표시 */}
                        <div className="flex items-center justify-center my-6">
                            <span className={`text-4xl font-black tabular-nums ${isUnlimited ? 'text-gray-400' : 'text-brandBlue'}`}>
                                {displayValue}
                            </span>
                        </div>
                        {/* 슬라이더 */}
                        <div className="px-2 mb-2">
                            <input
                                type="range"
                                min={0}
                                max={max}
                                step={step}
                                value={filterPickerTemp >= max ? max : filterPickerTemp}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                    const v = Number(e.target.value);
                                    setFilterPickerTemp(v >= max ? (isTaxi ? 99999 : 99) : v);
                                }}
                                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-brandBlue"
                                style={{ background: `linear-gradient(to right, #3B82F6 ${((filterPickerTemp >= max ? max : filterPickerTemp) / max) * 100}%, #E5E7EB ${((filterPickerTemp >= max ? max : filterPickerTemp) / max) * 100}%)` }}
                            />
                        </div>
                        {/* 최솟값/최댓값 레이블 */}
                        <div className="flex justify-between px-2 mb-6">
                            <span className="text-xs font-bold text-gray-400">{isTaxi ? '0원' : '0분'}</span>
                            <span className="text-xs font-bold text-gray-400">제한없음</span>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setFilterModalType(null)}
                                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-black text-sm"
                            >취소</button>
                            <button
                                onClick={() => {
                                    if (isTaxi) setPendingFilters({ ...pendingFilters, maxTaxi: filterPickerTemp });
                                    else setPendingFilters({ ...pendingFilters, maxWalk: filterPickerTemp });
                                    setFilterModalType(null);
                                }}
                                className="flex-1 py-3 rounded-2xl bg-brandBlue text-white font-black text-sm shadow-md shadow-blue-200"
                            >확인</button>
                        </div>
                    </div>
                </div>
            );
        })()}
    </div>
  );

  const renderDetails = () => {
    if (!selectedRoute) return renderResults();

    return (
      <div className="flex flex-col h-full bg-gray-50">
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
                     <CostChart taxiCost={fullTaxiCost} hybridCost={selectedRoute.hybridTotalCost} />
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
                                segment.type === 'subway' ? 'bg-brandMint' :
                                segment.type === 'taxi' ? 'bg-orange-400' : 'bg-brandYellow'}`}
                          >
                          </div>

                          <div className={`p-5 rounded-2xl shadow-sm border ${segment.type === 'taxi' ? 'bg-orange-50 border-orange-100' : 'bg-white border-gray-100'}`}>
                              <div className="flex justify-between items-start mb-2">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase
                                      ${segment.type === 'walk' ? 'bg-gray-100 text-gray-500' :
                                        segment.type === 'bus' ? 'bg-blue-50 text-brandBlue' :
                                        segment.type === 'subway' ? 'bg-green-50 text-brandMint' :
                                        segment.type === 'taxi' ? 'bg-orange-100 text-orange-600' : 'bg-yellow-50 text-yellow-600'}`}>
                                      {segment.type === 'taxi' ? '🚕 택시' :
                                       segment.type === 'walk' ? '🚶 도보' :
                                       segment.type === 'bus' ? `🚌 ${segment.lineName || '버스'}` :
                                       segment.type === 'subway' ? `🚇 ${segment.lineName || '지하철'}` :
                                       segment.lineName || segment.type}
                                  </span>
                                  <span className="text-xs font-bold text-gray-400">{segment.durationMinutes}분</span>
                              </div>
                              <p className="text-gray-800 font-bold text-lg mb-1">{segment.instruction}</p>
                              {segment.alightInstruction && (
                                  <p className="text-gray-500 font-bold text-sm mt-1 flex items-center gap-1">
                                      <span className="text-gray-400">↓</span>
                                      {segment.alightInstruction}
                                  </p>
                              )}
                              {segment.type === 'taxi' && segment.cost > 0 && (
                                  <p className="text-sm text-orange-500 font-black mt-2">예상 택시비 약 {segment.cost.toLocaleString()}원</p>
                              )}
                              {segment.type === 'subway' && segment.startName && (
                                  <RealTimeArrival
                                    type={segment.type}
                                    stationName={segment.startName}
                                    lineName={segment.lineName}
                                  />
                              )}
                              {segment.type === 'bus' && (segment.departureTime || segment.arrivalTime) && (
                                  <div className="mt-2 rounded-2xl border p-3 bg-blue-50 border-blue-100">
                                      <div className="flex items-center gap-1.5 mb-1">
                                          <span className="w-2 h-2 rounded-full bg-brandBlue" />
                                          <span className="text-xs font-black text-gray-600">🚌 탑승 예정 시간</span>
                                      </div>
                                      <div className="flex gap-4">
                                          {segment.departureTime && (
                                              <div>
                                                  <p className="text-[10px] text-gray-400 font-bold">탑승</p>
                                                  <p className="text-sm font-black text-brandBlue">{segment.departureTime}</p>
                                              </div>
                                          )}
                                          {segment.arrivalTime && (
                                              <div>
                                                  <p className="text-[10px] text-gray-400 font-bold">하차</p>
                                                  <p className="text-sm font-black text-brandBlue">{segment.arrivalTime}</p>
                                              </div>
                                          )}
                                      </div>
                                  </div>
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
                onClick={() => setShowTaxiSelector(true)}
                className="w-full bg-gray-900 text-white font-black text-xl py-5 rounded-2xl shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
           >
                <Car size={24} />
                <span>택시 호출하기</span>
           </button>

           {/* 택시 앱 선택 시트 */}
           {showTaxiSelector && (
               <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end" onClick={() => setShowTaxiSelector(false)}>
                   <div className="bg-white w-full rounded-t-[2rem] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                       <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
                       <p className="text-lg font-black text-gray-800 mb-1">택시 앱 선택</p>
                       <p className="text-xs text-gray-400 font-medium mb-5">앱이 설치되어 있으면 바로 열립니다</p>
                       <div className="space-y-3">
                           <button
                               onClick={() => openTaxiApp('kakao')}
                               className="w-full flex items-center gap-4 bg-[#FEE500] rounded-2xl px-5 py-4 active:scale-[0.98] transition-transform"
                           >
                               <div className="w-11 h-11 rounded-xl bg-black/10 flex items-center justify-center shrink-0 text-xl font-black text-gray-900">T</div>
                               <div className="flex-1 text-left">
                                   <p className="font-black text-gray-900">카카오T</p>
                                   <p className="text-xs text-gray-700 font-medium">카카오모빌리티</p>
                               </div>
                               <ChevronRight size={18} className="text-gray-600 shrink-0" />
                           </button>
                           <button
                               onClick={() => openTaxiApp('ut')}
                               className="w-full flex items-center gap-4 bg-[#FF6B00] rounded-2xl px-5 py-4 active:scale-[0.98] transition-transform"
                           >
                               <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0 text-xl font-black text-white">U</div>
                               <div className="flex-1 text-left">
                                   <p className="font-black text-white">UT (우티)</p>
                                   <p className="text-xs text-orange-100 font-medium">SKT · Uber</p>
                               </div>
                               <ChevronRight size={18} className="text-white/70 shrink-0" />
                           </button>
                       </div>
                       <button onClick={() => setShowTaxiSelector(false)} className="w-full mt-4 py-4 text-gray-400 font-bold text-sm">취소</button>
                   </div>
               </div>
           )}
        </div>
      </div>
    );
  };

  const renderLdtDetailPage = () => {
    if (!ldtResult) return renderResults();
    const baseMs = ldtResult.latestDepartureMs || Date.now();
    return (
      <div className="flex flex-col h-full bg-gray-50">
        <header className="px-4 py-3 flex items-center gap-2 bg-gradient-to-r from-[#1a1a2e] to-[#0f3460] sticky top-0 z-20 shadow-sm">
          <button onClick={handleBack} className="p-2 -ml-1 text-white/60 hover:text-white rounded-full hover:bg-white/10 transition-colors shrink-0">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-white/50 font-black uppercase tracking-widest">오늘의 찐막차</p>
            <h2 className="text-xl font-black text-white">{ldtResult.latestDepartureTime} 출발</h2>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-white/50 font-bold">남은 시간</p>
            <p className="text-sm font-black text-white">
              {ldtResult.remainingMinutes > 0
                ? `${ldtResult.remainingMinutes >= 60 ? `${Math.floor(ldtResult.remainingMinutes / 60)}h ${ldtResult.remainingMinutes % 60}m` : `${ldtResult.remainingMinutes}분`}`
                : '시간 지남'}
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {ldtRoutesLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-brandBlue rounded-full animate-spin" />
              <span className="text-gray-400 text-sm font-bold">막차 경로 불러오는 중...</span>
            </div>
          )}
          {!ldtRoutesLoading && ldtRoutes && ldtRoutes.length > 0 && ldtRoutes.map((route: HybridRoute, index: number) => {
            const accentColors = ['#3B82F6', '#06D6A0', '#8B5CF6'];
            const accent = accentColors[index] || '#3B82F6';
            const arrDate = new Date(baseMs + route.totalDuration * 60000);
            const arrH = arrDate.getHours();
            const arrM = arrDate.getMinutes();
            const arrStr = `${arrH < 12 ? '오전' : '오후'} ${arrH === 0 ? 12 : arrH > 12 ? arrH - 12 : arrH}:${arrM.toString().padStart(2, '0')}`;
            const durStr = route.totalDuration >= 60
              ? `${Math.floor(route.totalDuration / 60)}시간 ${route.totalDuration % 60 > 0 ? `${route.totalDuration % 60}분` : ''}`
              : `${route.totalDuration}분`;
            return (
              <div key={route.id}
                onClick={() => handleSelectRoute(route)}
                className="bg-white rounded-[2rem] overflow-hidden border-l-4 border border-gray-100 cursor-pointer shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
                style={{ borderLeftColor: accent }}>
                <div className="p-5">
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    <span className="text-white text-[11px] font-black px-3 py-1 rounded-full shadow-sm" style={{ backgroundColor: accent }}>
                      {route.routeLabel ?? `막차 ${index + 1}`}
                    </span>
                    {route.timeSavedByTaxi != null && route.timeSavedByTaxi > 0 && (
                      <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-orange-100 text-orange-500 border border-orange-200">🚕 {route.timeSavedByTaxi}분 단축</span>
                    )}
                    <span className="text-xs font-bold text-gray-400">🚏 {route.transferPoint}</span>
                  </div>
                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold mb-0.5">총 소요시간</p>
                      <p className="text-3xl font-black text-gray-900">{durStr}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 font-bold mb-0.5">도착 예정</p>
                      <p className="text-lg font-black text-gray-700">{arrStr}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-base font-black text-gray-800">{route.hybridTotalCost.toLocaleString()}원</span>
                    {route.taxiWalkCost > 0 && (
                      <span className="bg-orange-50 text-orange-500 text-xs font-black px-2.5 py-1 rounded-full border border-orange-200">
                        🚕 택시 {route.taxiWalkCost.toLocaleString()}원 포함
                      </span>
                    )}
                    <span className="bg-brandMint/10 text-brandMint text-xs font-black px-2.5 py-1 rounded-full border border-brandMint/20">
                      택시 대비 -{route.savedAmount.toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex items-stretch rounded-xl overflow-hidden gap-px">
                    {route.segments.map((seg, idx) => {
                      const isSubway = seg.type === 'subway';
                      const isBus = seg.type === 'bus';
                      const isTaxi = seg.type === 'taxi';
                      const icon = isSubway ? '🚇' : isBus ? '🚌' : isTaxi ? '🚕' : '🚶';
                      const bgColor = isSubway ? '#0052A4' : isBus ? '#3B82F6' : isTaxi ? '#F97316' : '#D1D5DB';
                      const textColor = seg.type === 'walk' ? '#6B7280' : '#ffffff';
                      return (
                        <div key={idx} className="flex flex-row items-center justify-start gap-0.5 px-1.5 py-2"
                          style={{ flex: Math.max(seg.durationMinutes, 3), backgroundColor: bgColor }}>
                          <span className="text-xs leading-none shrink-0">{icon}</span>
                          {seg.durationMinutes >= 4 && (
                            <span className="text-[10px] font-black whitespace-nowrap" style={{ color: textColor }}>{seg.durationMinutes}분</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          {!ldtRoutesLoading && (!ldtRoutes || ldtRoutes.length === 0) && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-4xl">🌙</p>
              <p className="text-gray-500 font-black text-base">경로 정보를 불러올 수 없어요</p>
              <p className="text-gray-400 text-xs font-bold text-center">해당 시각의 대중교통 경로가<br/>존재하지 않을 수 있어요</p>
            </div>
          )}
          <p className="text-gray-400 text-[10px] text-center pb-4">ODsay 시간표 기준 · 실제 운행 상황에 따라 다를 수 있어요</p>
        </div>
      </div>
    );
  };

  const renderContent = () => {
      // Priority Check for Open Now Tab content
      if (activeTab === 'OPEN_NOW') return renderOpenNow();

      switch(appState) {
          case AppState.HOME: return renderHome();
          case AppState.SEARCHING: return renderLoading();
          case AppState.RESULTS: return renderResults();
          case AppState.DETAILS: return renderDetails();
          case AppState.LDT_DETAIL: return renderLdtDetailPage();
          default: return renderHome();
      }
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-white text-gray-800 font-sans overflow-hidden shadow-2xl relative flex flex-col">
       <div className="flex-1 overflow-hidden relative">
            {renderContent()}
       </div>

       {/* 내 정보 오버레이 */}
       {activeTab === 'MY_PAGE' && (
           <div className="absolute inset-0 z-[80] animate-in slide-in-from-right-full duration-300">
               {renderMyPage()}
           </div>
       )}

       {/* 로그인 유도 팝업 */}
       {showLoginPrompt && (
           <div className="absolute inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200"
               onClick={() => setShowLoginPrompt(false)}>
               <div className="bg-white w-full rounded-t-[2rem] p-7 shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
                   onClick={e => e.stopPropagation()}>
                   <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
                   {/* 아이콘 */}
                   <div className="flex justify-center mb-4">
                       <div className="w-16 h-16 rounded-full bg-brandBlue flex items-center justify-center shadow-lg shadow-blue-200">
                           <Beer size={28} className="text-white -rotate-12" />
                       </div>
                   </div>
                   <p className="text-center text-xl font-black text-gray-800 leading-snug mb-2">
                       오늘 더 오래 놀고<br/>더 싸게 귀가하세요 🍻
                   </p>
                   <p className="text-center text-sm text-gray-400 font-medium leading-relaxed mb-7">
                       로그인하고 찐막차의 스마트 귀가 경로를<br/>지금 바로 검색해보세요!
                   </p>
                   <button
                       onClick={() => { setShowLoginPrompt(false); setShowLoginOverlay(true); }}
                       className="w-full bg-brandBlue text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-blue-200 active:scale-[0.98] transition-transform"
                   >
                       로그인하기
                   </button>
                   <button
                       onClick={() => setShowLoginPrompt(false)}
                       className="w-full mt-3 py-3 text-gray-400 font-bold text-sm"
                   >
                       나중에 할게요
                   </button>
               </div>
           </div>
       )}

       {/* 로그인 오버레이 */}
       {showLoginOverlay && (
           <div className="absolute inset-0 z-[90] animate-in slide-in-from-bottom-full duration-300">
               <div className="h-full relative">
                   {renderLogin()}
                   <button
                       onClick={() => setShowLoginOverlay(false)}
                       className="absolute top-5 right-5 z-10 w-9 h-9 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors"
                   >
                       <X size={18} className="text-gray-600" />
                   </button>
               </div>
           </div>
       )}
    </div>
  );
};

export default App;