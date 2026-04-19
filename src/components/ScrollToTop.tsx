import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets window scroll position to top on every route change.
 * Mounted once globally inside BrowserRouter.
 */
export const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
