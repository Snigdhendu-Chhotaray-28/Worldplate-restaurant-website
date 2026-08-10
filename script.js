document.addEventListener("DOMContentLoaded", () => {
    initThemeToggle();
    initMenuCarousel();
    initMobileMenu();
    initScrollToTop();
    initProductSearch();
    initMenuCardModal();
    initContactForm();
    
    // Wait for everything to load (including images)
    window.addEventListener("load", () => {
        const loader = document.getElementById("skeletonLoader");
        const mainContent = document.querySelector(".main-content");

        // Fade out loader
        loader.style.opacity = "0";
        
        setTimeout(() => {
            loader.style.display = "none";
            mainContent.style.visibility = "visible";
            
            // Start GSAP Animations after loader is hidden
            initAnimations();
        }, 500); // Wait for fade transition
    });
});

function initAnimations() {
    // GSAP Timeline for Hero Section
    const tl = gsap.timeline();

    // Animate Header
    tl.from(".logo", { y: -20, opacity: 0, duration: 0.6, ease: "power3.out" })
      .from(".navbar a", { y: -20, opacity: 0, duration: 0.6, stagger: 0.1, ease: "power3.out" }, "-=0.4")
      .from(".header-actions", { y: -20, opacity: 0, duration: 0.6, ease: "power3.out" }, "-=0.4");

    // Animate Hero Content
    tl.from(".hero-title", { y: 50, opacity: 0, duration: 0.8, ease: "power3.out" }, "-=0.2")
      .from(".hero-subtitle", { y: 30, opacity: 0, duration: 0.6, ease: "power3.out" }, "-=0.6")
      .fromTo(".hero-buttons .btn", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out", clearProps: "all" }, "-=0.4")
      .from(".hero-stats", { x: -30, opacity: 0, duration: 0.6, ease: "power3.out" }, "-=0.3");

    // Animate Hero Image Container
    tl.from(".hero-circle-bg", { scale: 0, opacity: 0, duration: 1, ease: "back.out(1.7)" }, "-=1")
      .from(".hero-img", { scale: 0.8, opacity: 0, rotation: 15, duration: 1, ease: "power3.out" }, "-=0.8")
      .from(".floating-badge", { y: 30, opacity: 0, duration: 0.6, ease: "back.out(1.5)" }, "-=0.5");

    // ScrollTrigger setup for Menu Section (optional, if we had it loaded, but basic animation works)
    gsap.from(".section-header", {
        scrollTrigger: {
            trigger: ".menu-section",
            start: "top 80%"
        },
        y: 30,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out"
    });

    gsap.from(".menu-card", {
        scrollTrigger: {
            trigger: ".menu-section",
            start: "top 70%"
        },
        y: 50,
        opacity: 0,
        duration: 0.8,
        stagger: 0.2,
        ease: "power3.out"
    });
}

function initThemeToggle() {
    const themeBtn = document.getElementById('theme-toggle');
    const body = document.body;
    const icon = themeBtn.querySelector('i');

    // Check for saved user preference, if any, on load of the website
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        body.classList.add(savedTheme);
        if(savedTheme === 'light-theme') {
            icon.classList.replace('bx-moon', 'bx-sun');
        }
    }

    themeBtn.addEventListener('click', () => {
        body.classList.toggle('light-theme');
        if (body.classList.contains('light-theme')) {
            icon.classList.replace('bx-moon', 'bx-sun');
            localStorage.setItem('theme', 'light-theme');
        } else {
            icon.classList.replace('bx-sun', 'bx-moon');
            localStorage.removeItem('theme');
        }
    });
}

function initMobileMenu() {
    const menuToggle = document.querySelector('.menu-toggle');
    const closeMenu = document.querySelector('.close-menu');
    const navbar = document.querySelector('.navbar');

    if (menuToggle && closeMenu && navbar) {
        menuToggle.addEventListener('click', () => {
            navbar.classList.add('active');
        });

        closeMenu.addEventListener('click', () => {
            navbar.classList.remove('active');
        });
        
        // Close menu when clicking a link
        const links = navbar.querySelectorAll('a');
        links.forEach(link => {
            link.addEventListener('click', () => {
                navbar.classList.remove('active');
            });
        });
    }
}

function initMenuCarousel() {
    const slider = document.querySelector('.menu-grid');
    if (!slider) return;

    // Clone items for infinite scroll effect
    const items = slider.querySelectorAll('.menu-card');
    items.forEach(item => {
        const clone = item.cloneNode(true);
        slider.appendChild(clone);
    });

    let isDown = false;
    let startX;
    let scrollLeft;
    let autoScrollInterval;

    // Auto scroll logic
    const startAutoScroll = () => {
        stopAutoScroll(); // Ensure we don't start multiple intervals
        autoScrollInterval = setInterval(() => {
            slider.scrollLeft += 1; // Adjust speed as needed
            // Reset to beginning if at halfway point (since we duplicated items)
            if (slider.scrollLeft >= (slider.scrollWidth / 2)) {
                slider.scrollLeft = 0;
            }
        }, 20);
    };

    const stopAutoScroll = () => {
        clearInterval(autoScrollInterval);
    };

    // Start auto scrolling initially
    startAutoScroll();

    // Pause on hover
    slider.addEventListener('mouseenter', stopAutoScroll);
    slider.addEventListener('mouseleave', () => {
        isDown = false;
        slider.classList.remove('active');
        startAutoScroll();
    });

    // Mouse drag events
    slider.addEventListener('mousedown', (e) => {
        isDown = true;
        slider.classList.add('active');
        startX = e.pageX - slider.offsetLeft;
        scrollLeft = slider.scrollLeft;
        stopAutoScroll(); // Stop while dragging
    });

    slider.addEventListener('mouseup', () => {
        isDown = false;
        slider.classList.remove('active');
        // Will be resumed by mouseleave
    });

    slider.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - slider.offsetLeft;
        const walk = (x - startX) * 2; // Scroll-fast multiplier
        slider.scrollLeft = scrollLeft - walk;
        
        // Infinite drag logic
        if (slider.scrollLeft >= (slider.scrollWidth / 2)) {
            slider.scrollLeft -= (slider.scrollWidth / 2);
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
        } else if (slider.scrollLeft <= 0) {
            slider.scrollLeft += (slider.scrollWidth / 2);
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
        }
    });
}

function initScrollToTop() {
    const scrollBtn = document.getElementById("scrollTopBtn");
    if (!scrollBtn) return;

    window.addEventListener("scroll", () => {
        if (window.scrollY > 300) {
            scrollBtn.classList.add("show");
        } else {
            scrollBtn.classList.remove("show");
        }
    });

    scrollBtn.addEventListener("click", () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    });
}

function initProductSearch() {
    const searchInput = document.getElementById('productSearchInput');
    const recommendationsList = document.getElementById('searchRecommendations');
    const notFoundMessage = document.getElementById('notFoundMessage');
    
    if (!searchInput) return;

    // We get products here so we have the initial list
    const products = document.querySelectorAll('.product-item');
    if(products.length === 0) return;

    const productNames = Array.from(products).map(product => {
        return {
            name: product.querySelector('h2').innerText,
            element: product
        };
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        recommendationsList.innerHTML = '';
        
        if (query.length >= 3) {
            const matches = productNames.filter(p => p.name.toLowerCase().includes(query));
            
            if (matches.length > 0) {
                recommendationsList.style.display = 'block';
                matches.forEach(match => {
                    const li = document.createElement('li');
                    li.innerText = match.name;
                    li.addEventListener('click', () => {
                        searchInput.value = match.name;
                        recommendationsList.style.display = 'none';
                        showOnlyProduct(match.name);
                    });
                    recommendationsList.appendChild(li);
                });
            } else {
                recommendationsList.style.display = 'none';
            }
        } else {
            recommendationsList.style.display = 'none';
            // If user clears the input, show all products
            if(query.length === 0) {
                resetProducts();
            }
        }
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.toLowerCase().trim();
            recommendationsList.style.display = 'none';
            
            if(query.length === 0) {
                resetProducts();
                return;
            }

            const exactMatch = productNames.find(p => p.name.toLowerCase() === query);
            const includesMatch = productNames.filter(p => p.name.toLowerCase().includes(query));
            
            if (exactMatch) {
                showOnlyProduct(exactMatch.name);
            } else if (includesMatch.length === 1) {
                showOnlyProduct(includesMatch[0].name);
            } else {
                showNotFound();
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            recommendationsList.style.display = 'none';
        }
    });

    function showOnlyProduct(productName) {
        notFoundMessage.style.display = 'none';
        products.forEach(p => {
            // Need to handle layout difference for mobile vs desktop, but 'flex' handles both here
            if (p.querySelector('h2').innerText === productName) {
                p.style.display = 'flex';
            } else {
                p.style.display = 'none';
            }
        });
    }

    function showNotFound() {
        notFoundMessage.style.display = 'block';
        products.forEach((p, index) => {
            if (index < 3) { // Show 3 best products
                p.style.display = 'flex';
            } else {
                p.style.display = 'none';
            }
        });
    }

    function resetProducts() {
        notFoundMessage.style.display = 'none';
        products.forEach(p => p.style.display = 'flex');
    }
}

function initMenuCardModal() {
    const openBtn = document.getElementById('openMenuCardBtn');
    const closeBtn = document.getElementById('closeMenuCardBtn');
    const modal = document.getElementById('menuCardModal');

    if (!openBtn || !closeBtn || !modal) return;

    openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
}

function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;
    
    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);

        const originalText = submitBtn.textContent;

        submitBtn.textContent = "Sending...";
        submitBtn.disabled = true;

        try {
            const response = await fetch("https://api.web3forms.com/submit", {
                method: "POST",
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                alert("Success! Your message has been sent.");
                form.reset();
            } else {
                alert("Error: " + data.message);
            }

        } catch (error) {
            alert("Something went wrong. Please try again.");
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}
