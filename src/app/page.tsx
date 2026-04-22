import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import About from "@/components/About";
import Menu from "@/components/Menu";
import Features from "@/components/Features";
import Testimonials from "@/components/Testimonials";
import Locations from "@/components/Locations";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <About />
      <Menu />
      <Features />
      <Testimonials />
      <Locations />
      <CTA />
      <Footer />
    </>
  );
}
