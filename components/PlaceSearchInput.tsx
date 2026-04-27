import React, { useState, useEffect, useRef } from 'react';
import { MapPin, X, Map } from 'lucide-react';
import { searchPoiSuggestions, setCachedCoordinates, PoiSuggestion } from '../services/tmapService';

interface Props {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    focusBorderClass?: string;
}

export default function PlaceSearchInput({
    value,
    onChange,
    placeholder = '장소, 건물명, 주소',
    focusBorderClass = 'focus:border-brandBlue',
}: Props) {
    const [query, setQuery] = useState(value || '');
    const [modalOpen, setModalOpen] = useState(false);
    const [results, setResults] = useState<PoiSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // 부모(GPS, 집 버튼)에서 값이 바뀌면 동기화
    useEffect(() => { setQuery(value); }, [value]);

    const handleSearch = async () => {
        const q = query.trim();
        if (!q) return;
        setResults([]);
        setSearched(false);
        setModalOpen(true);
        setLoading(true);
        const r = await searchPoiSuggestions(q);
        setResults(r);
        setLoading(false);
        setSearched(true);
    };

    const handleSelect = (poi: PoiSuggestion) => {
        setQuery(poi.name);
        onChange(poi.name);
        setCachedCoordinates(poi.name, { lat: poi.lat, lon: poi.lon });
        setModalOpen(false);
    };

    const handleMapView = (poi: PoiSuggestion, e: React.MouseEvent) => {
        e.stopPropagation();
        window.open(
            `https://map.kakao.com/link/map/${encodeURIComponent(poi.name)},${poi.lat},${poi.lon}`,
            '_blank'
        );
    };

    return (
        <div className="flex-1 flex gap-2">
            {/* 텍스트 입력 */}
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder={placeholder}
                className={`flex-1 bg-gray-50 border-2 border-transparent ${focusBorderClass} focus:bg-white rounded-2xl px-5 py-4 text-gray-800 focus:outline-none transition-all placeholder:text-gray-400 font-medium`}
            />
            {/* 검색 버튼 */}
            <button
                onClick={handleSearch}
                className="px-4 py-4 bg-brandBlue text-white rounded-2xl font-bold text-sm shrink-0 hover:bg-blue-500 active:scale-95 transition-all"
            >
                검색
            </button>

            {/* 결과 모달 */}
            {modalOpen && (
                <div
                    className="fixed inset-0 z-[80] bg-black/50 flex items-end justify-center"
                    onClick={() => setModalOpen(false)}
                >
                    <div
                        className="bg-white w-full max-w-lg rounded-t-3xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ maxHeight: '70vh' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* 모달 헤더 */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
                            <p className="font-black text-gray-800 text-base">
                                <span className="text-brandBlue">"{query}"</span> 검색 결과
                            </p>
                            <button
                                onClick={() => setModalOpen(false)}
                                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* 결과 목록 */}
                        <div className="overflow-y-auto flex-1">
                            {loading && (
                                <div className="flex items-center justify-center py-12 gap-3">
                                    <div className="w-5 h-5 border-2 border-gray-200 border-t-brandBlue rounded-full animate-spin" />
                                    <span className="text-gray-400 font-bold text-sm">검색 중...</span>
                                </div>
                            )}

                            {!loading && results.map((poi, i) => (
                                <div
                                    key={i}
                                    onClick={() => handleSelect(poi)}
                                    className="flex items-center gap-3 px-5 py-4 border-b border-gray-50 active:bg-blue-50 cursor-pointer hover:bg-gray-50"
                                >
                                    <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                        <MapPin size={16} className="text-brandBlue" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800 truncate">{poi.name}</p>
                                        {poi.address && (
                                            <p className="text-xs text-gray-400 mt-0.5 truncate">{poi.address}</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={e => handleMapView(poi, e)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-50 text-green-600 text-xs font-bold shrink-0 hover:bg-green-100 active:scale-95 transition-all"
                                    >
                                        <Map size={12} />
                                        지도
                                    </button>
                                </div>
                            ))}

                            {!loading && searched && results.length === 0 && (
                                <div className="flex flex-col items-center py-12 text-gray-400">
                                    <MapPin size={36} className="mb-3 opacity-30" />
                                    <p className="text-sm font-bold">검색 결과가 없어요</p>
                                    <p className="text-xs mt-1">다른 키워드로 다시 검색해보세요</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
